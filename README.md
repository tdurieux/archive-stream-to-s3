A stream for writing the contents of a tar file to s3

# Usage

## With Writable

```javascript
const { ArchiveStreamToS3 } = require("archive-stream-to-s3");
const gunzip = require("gunzip-maybe");

const toS3 = new ArchiveStreamToS3("my-bucket", "some/prefix/to/add", s3, [
  /.*foo.txt$/
]);

toS3.on("finish", () => {
  console.log("upload completed");
});

toS3.on("error", e => {
  console.error(e);
});

const archive = fs.createReadStream("archive.tgz");

//Note: if you have compressed archive you can decompress w/ gunzip-maybe.
archive.pipe(gunzip()).pipe(toS3);
```

## With Promise

You can also use the `promise` function that has gunzip built in.

```javascript
const { promise } = require("archive-stream-to-s3");

const archive = fs.createReadStream("archive.tgz");

promise("my-bucket", "prefix", s3, archive).then(result => {
  console.log(result); //=> { keys: [...]}
});
```

# Contributing

## Unit tests

```shell
npm run test
```

## Integration tests

For integration tests to run you'll need to set the following env vars:

| name                             | purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| ARCHIVE_STREAM_TO_S3_TEST_BUCKET | the s3 bucket, this bucket is removed and recreated |
| ARCHIVE_STREAM_TO_S3_TEST_PREFIX | the prefix to use                                   |

You'll also need the aws-cli commands on your path.

### Run

```shell
npm run it
```

# Release

```shell
npm run release
```
