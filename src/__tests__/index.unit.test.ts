import { ArchiveStreamToS3 } from "..";
import * as debug from "debug";
import { createStream } from "./create-stream";

const log = debug("archive-stream-to-s3:test");
describe("ArchiveStreamToS3", () => {
  test(
    "works",
    done => {
      const s3 = {
        putObject: jest.fn(opts => ({
          promise: jest.fn(() => {
            return new Promise((resolve, reject) => {
              opts.Body.resume();
              setTimeout(() => {
                // we are assuming that s3 sdk drains the stream - so simulate it here
                resolve({ Key: "Foo" });
              }, 1000);
            });
          })
        }))
      };
      const toS3 = new ArchiveStreamToS3("bucket", "prefix", s3 as any, []);

      toS3.on("finish", () => {
        log("finish: ");
        done();
      });

      toS3.on("error", e => {
        log("error: ", e);
        done(e);
      });
      const demo = createStream();
      demo.pipe(toS3);
    },
    10000
  );
});
