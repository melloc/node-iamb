# iamb

## About

This is a vi-inspired terminal chat client that plans to support the following
protocols:

- Jabber (not yet implemented)
- Matrix (not yet implemented)
- Mattermost (in progress)

__*This is still heavily in development and anything and everything is subject
to change.*__ For now, you can try it out by creating a `mm-account.json` file
in the repo that looks like:

```
{
    "url": "<mattermost url",
    "team": "<your team name>",
    "auth": {
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

