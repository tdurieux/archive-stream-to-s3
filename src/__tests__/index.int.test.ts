import * as AWS from "aws-sdk";
import { ArchiveStreamToS3 } from "..";
import { createStream } from "./create-stream";
import * as debug from "debug";
import { execSync } from "child_process";

const log = debug("archive-stream-to-s3:test");

const s3 = new AWS.S3();
const initBucket = name => {
  log(`removing test bucket: ${name}`);
  execSync(`aws s3 rm --recursive s3://${name}`);
  log(`creating test bucket: ${name}`);
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

const bucket =
  process.env.ARCHIVE_STREAM_TO_S3_TEST_BUCKET || "archive-stream-to-s3-test";

const prefix = process.env.ARCHIVE_STREAM_TO_S3_TEST_PREFIX || "test_prefix";

const pipe = () =>
  new Promise((resolve, reject) => {
    const toS3 = new ArchiveStreamToS3(bucket, prefix, s3);

    const src = createStream({
      "one.txt": "one",
      "two.txt": "two"
    });

    toS3.on("finish", data => {
      resolve(data);
    });

    toS3.on("error", e => {
      reject(e);
    });
    src.pipe(toS3);
  });

const download = (...names: string[]) => {
  const promises = names.map(n =>
    s3
      .getObject({ Bucket: bucket, Key: n })
      .promise()
      .then(d => {
        return d.Body.toString();
      })
  );
  return Promise.all(promises);
};

describe("archive-stream-to-s3", () => {
  let result;
  beforeAll(async () => {
    await initBucket(bucket);
    result = await pipe();
  });

  it("works", () => {
    expect(result.keys).toEqual([`${prefix}/one.txt`, `${prefix}/two.txt`]);
  });
  it.only("file contents match", async () => {
    const downloaded = await download(`${prefix}/one.txt`, `${prefix}/two.txt`);

    expect(downloaded[0]).toEqual("one");
    expect(downloaded[1]).toEqual("two");
  });
});
