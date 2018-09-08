#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const proxy = require('http-proxy-middleware');
const simpleGit = require('simple-git');
const rimraf = require('rimraf');
const { promisify } = require('util');
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
        this.localMode = false;
        if (args.workingPath) {
            this.currentPath = args.workingPath;
            this.localMode = true;
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

    cloneLast() {
        return new Promise(async (resolve, reject) => {
            console.log('start to clone last documentation');
            let newPath = `docz-${(new Date()).getTime()}`;
            this.git.clone(this.gitRepoUrl, newPath, (err) => {
                if (err) return reject(err);

                console.log('clone end, rename folder with hash');
                let timerPath = path.join(this.workingPath, newPath);
                let git = simpleGit(timerPath);
                new Promise((res, rej) => {
                    git.revparse(['HEAD'], (err, tag) => {
                        tag = tag.trim();
                        let tagPath = path.join(this.workingPath, `docz-${tag}`);
                        if (fs.existsSync(tagPath)) {
                            console.warn(
                                'folder with hash name already exist, remove temp folder, and let the previous folder');
                            rimraf.sync(timerPath);
                        }
                        else {
                            fs.renameSync(timerPath, tagPath);
                        }


                        resolve(tagPath);
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
        if (fs.existsSync(this.currentPath))
            fs.unlinkSync(this.currentPath);
        fs.symlinkSync(currentPath, this.currentPath);
    }

    stdoutHandler(data) {
        if (data.toString().match(/Your application is running/ig)) {
            // console.log(`data : ${data.toString()}`);
            this.doczStarted();
        }
        if (data.toString().match(/fail/ig)) {
            console.error(`docz: ${data}`);
        }
    };

    doczStarted() {
        if (!this.localMode)
            this.startProxy();
        else {
            console.log('doc build success');
            this.docz.stdin.pause();
            this.docz.kill();
            process.exit(0);
        }
    }

    stderrHandler(data) {
        console.error(`docz: ${data}`);
    };

    closeHandler(code) {
        if (code > 0) {
            console.error(`docz exited with code ${code}`);
            process.exit(code);
        }
        if (!this.restarting) {
            process.exit(code);
        }
    };

    startProxy() {
        if (!this.runnerStarted)
            this.runnerStarted = true;
        else
            return;

        console.log('build success');
        if (argv.test) {
            //if test mode, the test succeed
            process.exit(0);
        }
        else {
            let expressPort = process.env.PORT || 3001;

            app.use(async (req, res, next) => {
                let gitlabEvent = req.header('X-Gitlab-Event');
                let gitlabToken = req.header('X-Gitlab-Token');
                //token qsdgsdthshgbyry534fs21df65841
                try {
                    console.log(`receive gitlabEvent : ${gitlabEvent}`);
                    console.log(`receive gitlabToken : ${gitlabToken}`);
                    console.log(`status : ${req.body.object_attributes.status}`);
                }
                catch (e) {
                    console.error(e);
                }

                if (gitlabToken !== process.env.GITLAB_TOKEN) {
                    //if not the correct token
                    next();
                }
                else {
                    try {
                        if (req && req.body && req.body.object_attributes && req.body.object_attributes.status && req.body.object_attributes.status === 'success') {
                            console.log('receive request to download new docz');

                            //it's success, clone new repo, and kill me
                            this.restarting = true;

                            console.log('start cloning');
                            let newPath = await this.cloneLast();
                            console.log(`cloned into ${newPath}`);
                            console.log(`kill docz process`);
                            this.docz.stdin.pause();
                            this.docz.kill();
                            console.log(`set new current folder to ${newPath}`);
                            await this.setCurrent(newPath);
                            console.log(`wait quit`);
                            this.needToQuit = true;
                        }
                    }
                    catch (e) {
                        console.error(e);
                    }
                    res.status(200).send('Ok!');
                    if (this.needToQuit)
                        process.exit(0);
                }


            });

            app.use('/', proxy({ target: 'http://127.0.0.1:3000', changeOrigin: true }));

            app.listen(expressPort, () => console.log(`Runner listening on port ${expressPort}!`));
        }
    }

    async start() {
        if (!this.localMode)
            await this.checkCurrentDoc();

        //check the number of folder, 10 will be enough
        await this.checkNumberOfFolder(10);

        console.log('start to build docz');
        //need to install docz locally in the project
        this.docz = spawn(
            path.resolve(`./node_modules/.bin/docz${process.platform === 'win32' ? '.cmd' : ''}`),
            ['dev'],
            { cwd: this.currentPath },
        );

        this.docz.stdout.on('data', (data) => {this.stdoutHandler(data);});

        this.docz.stderr.on('data', (data) => {this.stderrHandler(data);});

        this.docz.on('close', (code) => {this.closeHandler(code);});

        return new Promise(() => {
            setInterval(() => {
                //just to keep process open
            }, 100);
        });
    }

    async checkNumberOfFolder(nbToRemove = 10) {
        let readdir = promisify(fs.readdir);

        let items = await readdir(this.workingPath);
        items = items.filter(item => item !== 'current').map((fileName) => {
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
        console.log(items);
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