#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
// const proxy = require('http-proxy-middleware');
const simpleGit = require('simple-git');
const rimraf = require('rimraf');
const { promisify } = require('util');
const ncp = promisify(require("ncp"));
const boolean = require('boolean');
const argv = require('yargs')
    .command('$0 [path]', 'start the runner', (yargs) => {
        yargs.positional('sourcePath', {
            describe: 'use a sourcePath to disable the automatic git clone',
            type    : 'string',
        });
    })
    .help()
    .argv;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

class Runner {
    constructor(args) {
        if(boolean(process.env.CI_MODE)){
            console.log("CI_MODE: CI mode is activated");
        }

        if(process.env.GITLAB_TOKEN)
            console.log(`GITLAB_TOKEN ${process.env.GITLAB_TOKEN}`);
        else
            console.log(`NO GITLAB_TOKEN`);

        this.localMode = false;
        if (args.workingPath) {
            this.currentPath = args.workingPath;
            this.localMode = true;
            console.log('use localMode');
        }
        else {
            this.basePath = path.resolve(__dirname);
            this.workingPath = path.join(this.basePath, 'working');
            this.currentPath = path.join(this.workingPath, 'current');
            console.log(`workingPath : ${this.workingPath}, exist ? ${fs.existsSync(this.workingPath)}`);
            this.git = simpleGit(this.workingPath);
            this.gitRepoUrl = process.env.GIT_REPO;
            if (!this.gitRepoUrl)
                throw new Error('empty git repo url !');
        }

        this.restarting = false;
        this.runnerStarted = false;
        this.needToQuit = false;
    }

    startHttpd(){
        let expressPort = process.env.PORT || 3001;

        app.use(async (req, res, next) => {
            let gitlabEvent = req.header('X-Gitlab-Event');
            let gitlabToken = req.header('X-Gitlab-Token');

            if (gitlabEvent && gitlabToken === process.env.GITLAB_TOKEN) {
                try {
                    if (gitlabEvent === 'Pipeline Hook' && req && req.body && req.body.object_attributes && req.body.object_attributes.status && req.body.object_attributes.status === 'success') {
                        console.log('receive request to download new docz');

                        //it's success, clone new repo, and kill me
                        this.restarting = true;

                        console.log('start cloning');
                        let currentPath = await this.cloneLast();
                        this.setCurrent(currentPath);
                        console.log("new version ready");

                        this.checkNumberOfFolder().catch(e=>console.error(e));
                    }
                }
                catch (e) {
                    console.error(e);
                }
                res.status(200).send('Ok!');
                if (this.needToQuit)
                    process.exit(0);
            }
            else {
                if (gitlabToken)
                    console.warn(`bad gitlab token : ${gitlabToken}`);

                //if not the correct token
                next();
            }


        });

        app.use('/', express.static(path.join(this.workingPath, "current")));

        app.listen(expressPort, () => console.log(`Runner listening on port ${expressPort}!`));
    }

    cloneLast() {
        return new Promise(async (resolve, reject) => {
            console.log('start to clone last documentation');
            let newPath = `docz-${(new Date()).getTime()}`;
            this.git.clone(this.gitRepoUrl, newPath, (err) => {
                if (err) return reject(err);

                console.log('clone end, start the build');
                let timerPath = path.join(this.workingPath, newPath);
                let git = simpleGit(timerPath);
                new Promise((res, rej) => {
                    git.revparse(['HEAD'], async (err, tag) => {
                        tag = tag.trim();
                        let tagPath = path.join(this.workingPath, `docz-${tag}`);
                        if (fs.existsSync(tagPath)) {
                            console.warn(
                                'folder with hash name already exist, remove temp folder, and let the previous folder');
                            rimraf.sync(timerPath);
                        }
                        else {
                            try{
                                fs.mkdirSync(tagPath);

                                this.process = spawn('yarn',
                                    ['run', 'docz:build'],
                                    { cwd: timerPath },
                                );

                                await new Promise((res, rej) => {
                                    this.process.stdout.on('data', (data) => {
                                        // console.log(data.toString());
                                        if (data.toString().match(/fail/ig)) {
                                            rej(`docz: ${data}`);
                                        }
                                    });

                                    this.process.stderr.on('data', (data) => {
                                        rej(`docz: ${data}`);
                                    });

                                    this.process.on('close', (code) => {
                                        if (code > 0) {
                                            rej(`docz exited with code ${code}`);
                                        }
                                        else{
                                            res();
                                        }
                                    });
                                });

                                await ncp(path.join(timerPath, ".docz", "dist"), tagPath);

                                rimraf.sync(timerPath);
                                console.log("builded");
                                resolve(tagPath);
                                // fs.renameSync(timerPath, tagPath);
                            }
                            catch (e) {
                                console.error(e);
                            }
                        }
                    });
                });

            });
        });
    }

    async checkCurrentDoc() {
        if (!fs.existsSync(path.join(this.workingPath, 'current'))) {
            //the folder doesn't exist
            let actualPath = await this.cloneLast();

            //generate the symlink
            this.setCurrent(actualPath);
        }
    }

    setCurrent(currentPath) {
        console.log(`set new Current folder to ${currentPath}`);
        if (fs.existsSync(this.currentPath))
            fs.unlinkSync(this.currentPath);

        //windows doesn't support symlink
        if (process.platform === 'win32')
            console.warn("win32 doesn't support symlink");
        else
            fs.symlinkSync(currentPath, this.currentPath);
    }

    async start() {
        if (!this.localMode) {
            await this.checkCurrentDoc();

            //check the number of folder, 10 will be enough
            await this.checkNumberOfFolder(10);
        }

        //if it's CIMode exit before starting httpd
        if(boolean(process.env.CI_MODE)){
            console.log("CI_MODE: CI of doc success");
            process.exit(0);
        }


        console.log('start to build docz');
        //need to install docz locally in the project
        // this.docz = spawn(
        //     path.resolve(`./node_modules/.bin/docz${process.platform === 'win32' ? '.cmd' : ''}`),
        //     ['dev'],
        //     { cwd: this.currentPath },
        // );
        //
        // this.docz.stdout.on('data', (data) => {this.stdoutHandler(data);});
        //
        // this.docz.stderr.on('data', (data) => {this.stderrHandler(data);});
        //
        // this.docz.on('close', (code) => {this.closeHandler(code);});

        this.startHttpd();

        return new Promise(() => {
            setInterval(() => {
                //just to keep process open
            }, 100);
        });
    }

    async checkNumberOfFolder(nbToRemove = 10) {
        console.log("check old folders");
        let readdir = promisify(fs.readdir);

        let items = await readdir(this.workingPath);
        items = items.filter(item => ['current', '.gitkeep'].indexOf(item) < 0).map((fileName) => {
                         return {
                             name: fileName,
                             time: fs.statSync(this.workingPath + '/' + fileName).mtime.getTime(),
                         };
                     })
                     .sort(function (a, b) {
                         return a.time - b.time;
                     })
                     .map(function (v) {
                         return v.name;
                     });

        //remove older folders
        items.slice(0, -nbToRemove).forEach(item => console.log(`remove ${item}`));
        items.slice(0, -nbToRemove).forEach(item => rimraf.sync(path.join(this.workingPath, item)));
        // console.log(items);
    }
}

try {
    let runner = new Runner({ workingPath: argv.path });

    runner.start()
          .catch(e => {
              console.error(e);
          });
}
catch (e) {
    console.error(e);
}
