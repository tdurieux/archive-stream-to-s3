import ArchiveStreamToS3 from "../index";
import debug from "debug";
import { createTarStream, createZipStream } from "./create-stream";
import { createS3, initBeforeEach } from "./index.int.test";

const log = debug("archive-stream-to-s3:test");
describe("ArchiveStreamToS3", () => {
  let s3;

  beforeEach(() => {
    s3 = createS3();
    initBeforeEach();
  });

  const pipe = (
    data: any,
    ignore: RegExp[] = [],
    type: "tar" | "zip" = "tar"
  ) =>
    new Promise((resolve, reject) => {
      const toS3 = new ArchiveStreamToS3({
        bucket: "bucket",
        prefix: "prefix",
        s3,
        ignores: ignore,
        type,
      });

      toS3.on("finish", (result: any) => {
        resolve(result);
      });

      toS3.on("error", (e) => {
        reject(e);
      });

      if (type === "zip") {
        createZipStream(data).pipe(toS3);
      } else {
        createTarStream(data).pipe(toS3);
      }
    });

  it("pipes 2 files in tar", () =>
    pipe({ "one.txt": "one", "two.txt": "two" }, [], "tar")
      .then((result: any) => {
        log("results:", result);
        expect(result.keys[0]).toEqual("prefix/one.txt");
        expect(result.keys[1]).toEqual("prefix/two.txt");
      })
      .catch((e) => fail(e.message)));
  it("pipes 2 files in zip", () =>
    pipe({ "one.txt": "one", "two.txt": "two" }, [], "zip")
      .then((result: any) => {
        log("results:", result);
        expect(result.keys[0]).toEqual("prefix/one.txt");
        expect(result.keys[1]).toEqual("prefix/two.txt");
      })
      .catch((e) => fail(e.message)));

  it("fixes bad paths in tar", () =>
    pipe({ "one//one.txt": "one" }, [], "tar")
      .then((result: any) => {
        log("results:", result);
        expect(result.keys[0]).toEqual("prefix/one/one.txt");
      })
      .catch((e) => fail(e.message)));

  it("uses the ignore array in tar", () =>
    pipe({ "one.txt": "one", "two.txt": "two" }, [/one\.txt/], "tar").then(
      (result: any) => {
        expect(result.keys.length).toEqual(1);
        expect(result.keys[0]).toEqual("prefix/two.txt");
      }
    ));
  it("fixes bad paths in zip", () =>
    pipe({ "one//one.txt": "one" }, [], "zip")
      .then((result: any) => {
        log("results:", result);
        expect(result.keys[0]).toEqual("prefix/one/one.txt");
      })
      .catch((e) => fail(e.message)));

  it("uses the ignore array in zip", () =>
    pipe({ "one.txt": "one", "two.txt": "two" }, [/one\.txt/], "zip").then(
      (result: any) => {
        expect(result.keys.length).toEqual(1);
        expect(result.keys[0]).toEqual("prefix/two.txt");
      }
    ));
});
