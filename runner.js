#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const argv = require('yargs').argv;
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const proxy = require('http-proxy-middleware');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


console.log("start to build docz");
//need to install docz locally in the project
const docz = spawn(path.resolve(`./node_modules/.bin/docz${process.platform === 'win32' ? '.cmd' : ''}`), ['dev'],
    { cwd: path.resolve('.') });

docz.stdout.on('data', (data) => {
    if (data.toString().match(/Your application is running/ig)) {
        console.log('builded');
        startRunner()
    }
    if (data.toString().match(/fail/ig)) {
        console.error(`docz: ${data}`);
    }
    // console.log(`stdout : ${data}`);
});

docz.stderr.on('data', (data) => {
    console.error(`docz: ${data}`);
});

docz.on('close', (code) => {
    if (code > 0) {
        console.error(`docz exited with code ${code}`);
        process.exit(code);
    }
});

function startRunner() {
   console.log("build success");
   if (argv.test) {
        //if test mode, the test succeed
        process.exit(0);
    }
    else{
       let expressPort = process.env.PORT||3001;

       app.use('/', proxy({target: 'http://127.0.0.1:3000', changeOrigin: true}));

       app.get('/gitlab', (req, res) => {

           let gitlabEvent = req.getHeader("X-Gitlab-Event");

           console.log(`receive gitlabEvent : ${gitlabEvent}`);
           console.log(`status : ${req.object_attributes.status}`);

           console.log(req);
       });

       app.listen(expressPort, () => console.log(`Runner listening on port ${expressPort}!`));
   }
}