#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const proxy = require('http-proxy-middleware');
const simpleGit = require('simple-git');
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
        if(args.workingPath){
            this.currentPath = args.workingPath;
            this.localMode = true;
        }
        else{
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

            let newPath = `docz-${(new Date()).getTime()}`;
            this.git.clone(this.gitRepoUrl, newPath, (err) => {
                if (err) return reject(err);

                let timerPath = path.join(this.workingPath, newPath);
                let git = simpleGit(timerPath);
                new Promise((res, rej) => {
                    git.revparse(['HEAD'], (err, tag) => {
                        tag = tag.trim();
                        let tagPath = path.join(this.workingPath, `docz-${tag}`);
                        fs.renameSync(timerPath, tagPath);
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

    setCurrent(currentPath){
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

    doczStarted(){
        if(!this.localMode)
            this.startProxy();
        else{
            console.log("doc build success");
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

            app.use(function(req, res, next) {
                let gitlabEvent = req.getHeader('X-Gitlab-Event');
                //token qsdgsdthshgbyry534fs21df65841
                console.log(`receive gitlabEvent : ${gitlabEvent}`);
                console.log(`status : ${req.object_attributes.status}`);

                console.log(req);
                next();
            });

            app.use('/', proxy({ target: 'http://127.0.0.1:3000', changeOrigin: true }));

            // app.get('/gitlab', (req, res) => {
            //
            //     let gitlabEvent = req.getHeader('X-Gitlab-Event');
            //
            //     console.log(`receive gitlabEvent : ${gitlabEvent}`);
            //     console.log(`status : ${req.object_attributes.status}`);
            //
            //     console.log(req);
            // });

            app.listen(expressPort, () => console.log(`Runner listening on port ${expressPort}!`));
        }
    }

    async start() {
        if(!this.localMode)
            await this.checkCurrentDoc();

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

        return new Promise((res, rej)=>{
            this.rebootInterval = setInterval(()=>{
                if(this.needToQuit){
                    clearInterval(this.rebootInterval);
                    res();
                }
            },100)
        })
    }
}

try{
    let runner = new Runner({ workingPath: argv.path });

    runner.start()
          .then((e) => {
              debugger;
          })
          .catch(e => {
              console.error(e);
          });
}
catch (e) {
    console.error(e);
}

//
// let runnerStarted = false;
// function startRunner() {
//     if(!runnerStarted)
//         runnerStarted = true;
//     else
//         return;
//    console.log("build success");
//    if (argv.test) {
//         //if test mode, the test succeed
//         process.exit(0);
//     }
//     else{
//        let expressPort = process.env.PORT||3001;
//
//        app.use('/', proxy({target: 'http://127.0.0.1:3000', changeOrigin: true}));
//
//        app.get('/gitlab', (req, res) => {
//
//            let gitlabEvent = req.getHeader("X-Gitlab-Event");
//
//            console.log(`receive gitlabEvent : ${gitlabEvent}`);
//            console.log(`status : ${req.object_attributes.status}`);
//
//            console.log(req);
//        });
//
//        app.listen(expressPort, () => console.log(`Runner listening on port ${expressPort}!`));
//    }
// }