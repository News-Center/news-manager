# General purpose

The `news-manager` is used to deliver relevant news to the user. It manages the clients/channels registration and
delivers
news
after applying a thorough matching algorithm. Please note that the `user-api` and `news-api` are accessing the same
database.

## How it works

When news are created, the news-manager will be called and will determine the relevancy of the news for each user.
If the news are relevant, the news-manager will schedule the news for delivery. The news will be delivered to the user
by the clients the user subscribed to.

### Relevancy detection

How do we detect if a message is relevant?
The mechanism employed to determine the relevance of a message involves a multi-phase algorithm centered around the
message's tags. Subsequently, the liked messages of users are taken into consideration before the messages are
delivered.

![Tag Recognition Workflow](./tagrecognition-Tag_Erkennung_Workflow.svg =200x200)

The logic for this is contained in `src/routes/publish/index.ts`. All the phases are logged to the console for easy
debugging.

### News delivery

The news-manager enables the admin to register clients. Subscribed channels/clients will be
invoked
for the delivery of news. 

_Note: The `user-api` enables the user to subscribe to channels/clients._

This service is used by news-api to deliver news to the user. The clients are responsible for
delivering
the actual messages via Discord and so on.

This service maintains loose coupling with various clients, allowing for
seamless
client changes without requiring
modifications to the service itself. The only requirement is the availability of a POST route under `/publish`. The
service invokes a POST request to the `/publish` route for news publication of each subscribed user, with the following
JSON payload:

```json
{
  "title": "",
  "content": "",
  "handle": ""
  // Note: The handle is essentially the username
}
```

The URLs for the clients themselves are configured by the admin via the UI with separate routes in the background. This
service simple
calls `http://<client-url>/publish` with the above JSON
payload and is unaware of the details of the client.

# Setup

## Prerequisite

- Node.js Version 16
- npm Version 8

## Dev-Setup

1. Clone the repo

```bash
  git clone git@github.com:News-Center/news-manager.git
```

2. Install dependencies

```bash
  npm install
```

3. Setup the .env file (For a Quickstart copy the example from the `.env.example` file)
4. Start the application

```bash
  ubuntu run
  make up
```

## Production-Setup

Use `news-kraken` to deploy the entire application to a server. For more information see refer to the news-kraken
repository.

# Potential Issues

The matching algorithm although being capable of really impressive results, might have a performance issue when there
are
more users and tags involved. One might also want to keep an eye on the OpenAPI usage, as it might get expensive.
However, during the development phase, we did not encounter any issues. More testing is required to determine if this is
an issue.

# Ideas for improvement

* More external services could be integrated to improve the relevancy detection.
* The like determination could be improved to allow for more fine-grained control over the relevancy of messages. For
  example,
  don't look for common likes but rather for a percentage of common likes.
* For scheduling message a persistent queue could be used to ensure that messages are not lost in case of a crash.