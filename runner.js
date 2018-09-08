#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const argv = require('yargs').argv;
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const proxy = require('http-proxy-middleware');
const simpleGit = require('simple-git');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

class Runner {
    // process;
    // basePath;

    constructor() {
        this.basePath = path.resolve(__dirname);
        this.workingPath = path.join(this.basePath, 'working');
        this.git = simpleGit(this.workingPath);
        this.gitRepoUrl = process.env.GIT_REPO;
        if (!this.gitRepoUrl)
            throw new Error('empty git repo url !');
    }

    cloneLast() {
        return new Promise((resolve, reject) => {
            this.git.clone(this.gitRepoUrl, `docz-${(new Date()).getTime()}`, () => {
                debugger;
            });
        });
    }

    async checkFolders() {
        if (!fs.existsSync(path.join(this.basePath, 'documentationFolder'))) {
            //the folder doesn't exist
            await this.cloneLast();

            // await new Promise((res, rej)=>{
            //     fs.mkdir(path,function(e){
            //         if(e) return rej(e);
            //         res();
            //     });
            // })
        }


    }
}

let runner = new Runner();
runner.checkFolders()
      .then((e) => {
          debugger;
      })
      .catch(e => {
          debugger;
      });

// console.log("start to build docz");
// //need to install docz locally in the project
// const docz = spawn(path.resolve(`./node_modules/.bin/docz${process.platform === 'win32' ? '.cmd' : ''}`), ['dev'],
//     { cwd: path.resolve('.') });
//
// docz.stdout.on('data', (data) => {
//     if (data.toString().match(/Your application is running/ig)) {
//         console.log(`data : ${data.toString()}`);
//         startRunner()
//     }
//     if (data.toString().match(/fail/ig)) {
//         console.error(`docz: ${data}`);
//     }
//     // console.log(`stdout : ${data}`);
// });
//
// docz.stderr.on('data', (data) => {
//     console.error(`docz: ${data}`);
// });
//
// docz.on('close', (code) => {
//     if (code > 0) {
//         console.error(`docz exited with code ${code}`);
//         process.exit(code);
//     }
// });
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