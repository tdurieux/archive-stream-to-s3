import { ArchiveStreamToS3 } from "..";
import * as debug from "debug";
import { createStream } from "./create-stream";

const log = debug("archive-stream-to-s3:test");
describe("ArchiveStreamToS3", () => {
  let s3;

  beforeEach(() => {
    s3 = {
      upload: jest.fn(opts => ({
        promise: jest.fn(() => {
          return new Promise(resolve => {
            opts.Body.resume();
            setTimeout(() => {
              // we are assuming that s3 sdk drains the stream - so simulate it here
              resolve({ Key: opts.Key });
            }, 200);
          });
        })
      }))
    };
  });

  const pipe = (data: any, ignore: RegExp[] = []) =>
    new Promise((resolve, reject) => {
      const toS3 = new ArchiveStreamToS3("bucket", "prefix", s3 as any, ignore);

      toS3.on("finish", (result: any) => {
        resolve(result);
      });

      toS3.on("error", e => {
        reject(e);
      });

      const demo = createStream(data);
      demo.pipe(toS3);
    });

  it("pipes 2 files", () =>
    pipe({ "one.txt": "one", "two.txt": "two" })
      .then((result: any) => {
        log("results:", result);
        expect(result.keys[0]).toEqual("prefix/one.txt");
        expect(result.keys[1]).toEqual("prefix/two.txt");
      })
      .catch(e => fail(e.message)));

  it("fixes bad paths", () =>
    pipe({ "one//one.txt": "one" })
      .then((result: any) => {
        log("results:", result);
        expect(result.keys[0]).toEqual("prefix/one/one.txt");
      })
      .catch(e => fail(e.message)));

  it("uses the ignore array", () =>
    pipe(
      { "one.txt": "one", "two.txt": "two" },
      [/one\.txt/]
    ).then((result: any) => {
      expect(result.keys.length).toEqual(1);
      expect(result.keys[0]).toEqual("prefix/two.txt");
    }));
});
