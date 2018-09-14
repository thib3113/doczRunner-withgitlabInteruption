
  ## # thib3113/doczrunner-withgitlabinteruption
This projet is here to run `docz dev` behind a proxy, waiting for webhooks from gitlab, with pipeline .

The goal of this image is to auto reload a styleguide, when we push on the gitlab repository .
We have a specific repository for the documentation .

This is divided in two part, the tag CI, will be used in Gitlab CI to test if docz correctly generate the documentation . When it's work, gitlab will send a webhook to the guideline website .

The other part is the website guideline, it will clone the repository in the working folder, symlink the `current` folder to this folder, and start `docz` on this folder . Behind this, we use an express proxy, handling the webhook of gitlab, to update the current folder . 

Env
---
| Key | Description |
|--|--|
| PORT |The port to be used by the express proxy [3001]|
| GIT_REPO | The url to the git repository ( ssh or HTTPS ) |
| SSH_HOST | URL of the git host ( site.com ), if not defined, doesn't support ssh url|
| SSH_KEY | The private key to use with SSH|
| SSH_KEY_PASSPHRASE | the passphrase of the SSH key (**Doesn't work**)|
| GITLAB_TOKEN | Token used by gitlab webhook |
| CI_MODE | Application will exit before starting webserver [false] |

All of this env work with _FILE for secrets .
Example, insteed of sending SSH_KEY, you can use :
`SSH_KEY=/run/secrets/SSH_KEY`
[See more details](https://docs.docker.com/engine/swarm/secrets/)

Volume
---
You can bind this volumes

| path in the container | description |
|--|--|
| /app/working | Contain multiple folders with clones of your documentation (the folder `current` is a symlink to the current folder used) |