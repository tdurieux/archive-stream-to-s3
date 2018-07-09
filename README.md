A stream for writing the contents of a tar file to s3

# Usage

```javascript
const { ArchiveStreamToS3 } = require("archive-stream-to-s3");

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
archive.pipe(toS3);
```
