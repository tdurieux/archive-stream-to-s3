import {
  S3,
  PutObjectCommand,
  GetObjectCommand,
  PutObjectCommandOutput,
  GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import ArchiveStreamToS3 from "../index";
import { createTarStream, streamToString } from "./create-stream";

const s3ClientMock = mockClient(S3);
const s3 = new S3({});

export function createS3() {
  mockClient(S3);
  return new S3({});
}

const bucket =
  process.env.ARCHIVE_STREAM_TO_S3_TEST_BUCKET || "archive-stream-to-s3-test";

const prefix = process.env.ARCHIVE_STREAM_TO_S3_TEST_PREFIX || "test_prefix";

const pipe = (type: "tar" | "zip" = "tar") =>
  new Promise((resolve, reject) => {
    const toS3 = new ArchiveStreamToS3({ bucket, prefix, s3, type });

    const src = createTarStream({
      "one.txt": "one",
      "two.txt": "two",
    });

    toS3.on("finish", (data) => {
      resolve(data);
    });

    toS3.on("error", (e) => {
      console.error("error", e);
      reject(e);
    });
    src.pipe(toS3);
  });

const download = (...names: string[]) => {
  const promises = names.map((n) =>
    s3.getObject({ Bucket: bucket, Key: n }).then((d) => {
      return d.Body;
    })
  );
  return Promise.all(promises);
};

let objects = {};

export async function initBeforeEach() {
  s3ClientMock.reset();
  objects = {};
  s3ClientMock.on(PutObjectCommand).callsFake(async (input) => {
    objects[input.Key] = await streamToString(input.Body);
    return Promise.resolve({
      ETag: "etag",
      VersionId: "version",
      ...input,
    } as PutObjectCommandOutput);
  });
  s3ClientMock.on(GetObjectCommand).callsFake((input) => {
    if (!objects[input.Key]) {
      return Promise.reject(new Error(`Key ${input.Key} not found`));
    }
    return Promise.resolve({
      Body: objects[input.Key],
      ...input,
    } as GetObjectCommandOutput);
  });
}

describe("archive-stream-to-s3", () => {
  beforeEach(initBeforeEach);

  it("upload test", async () => {
    const result: any = await pipe();
    expect(result.keys).toEqual([`${prefix}/one.txt`, `${prefix}/two.txt`]);
  });

  it("upload and file contents match", async () => {
    await pipe();
    const downloaded = await download(`${prefix}/one.txt`, `${prefix}/two.txt`);
    expect(downloaded[0]).toEqual("one");
    expect(downloaded[1]).toEqual("two");
  });
});
