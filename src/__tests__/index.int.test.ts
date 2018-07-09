import * as AWS from "aws-sdk";
import { ArchiveStreamToS3 } from "..";
import { createStream } from "./create-stream";
import * as debug from "debug";
import { execSync } from "child_process";

const log = debug("archive-stream-to-s3:test");

const s3 = new AWS.S3();
const initBucket = name => {
  execSync(`aws s3 rm --recursive s3://${name}`);
  return s3
    .createBucket({
      Bucket: name
    })
    .promise()
    .catch(e => {
      log(e.message);
      // do nothing
    });
};

describe("archive-stream-to-s3", () => {
  it("works", async () => {
    const bucket =
      process.env.ARCHIVE_STREAM_TO_S3_TEST_BUCKET ||
      "archive-stream-to-s3-test";

    const prefix =
      process.env.ARCHIVE_STREAM_TO_S3_TEST_PREFIX || "test_prefix";

    await initBucket(bucket);

    const toS3 = new ArchiveStreamToS3(bucket, prefix, s3);

    const src = createStream();

    return new Promise(resolve => {
      toS3.on("finish", data => {
        expect(data.keys).toEqual([
          "test_prefix/my-test.txt",
          "test_prefix/two.txt"
        ]);
        resolve();
      });

      toS3.on("error", e => {
        fail(e);
        resolve();
      });
      src.pipe(toS3);
    });
  });
});
