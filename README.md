# iamb

## About

This is a vi-inspired terminal chat client that plans to support the following
protocols:

- Jabber (not yet implemented)
- Matrix (not yet implemented)
- Mattermost ([in progress](https://github.com/melloc/node-iamb-mattermost))

__*Note that this project is still very much in its early stages and a
lot is subject to eventually change.*__

For now, you can try it out by creating a `mm-account.json` file in the repo
that looks like:

```
{
    "protocol": "mattermost",
    "url": "<mattermost url>",
    "auth": {
        "team": "<your team name>",
        "username": "<your username>",
        "password": "<your password>"
    }
}
```

And then running:

```
$ ./bin/iamb
```

You can use `:dm <username>` to start a conversation with another user.

## Installation

Install [node.js](http://nodejs.org/), then:

    npm install -g iamb

## License

MPL-v2

## Contributing

