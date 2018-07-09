import { S3 } from "aws-sdk";
import { Writable, Readable } from "stream";
import * as tar from "tar-stream";
import * as debug from "debug";
import { lookup } from "mime-types";
import { extname, normalize } from "path";

const log = debug("archive-stream-to-s3");

export class ArchiveStreamToS3 extends Writable {
  private extract: Writable;
  private promises: Promise<S3.ManagedUpload.SendData>[];
  constructor(
    readonly bucket: string,
    readonly prefix: string,
    readonly s3: S3,
    readonly ignores: RegExp[] = []
  ) {
    super();
    this.extract = tar.extract();
    this.promises = [];
    this.extract.on("entry", this.onEntry.bind(this));

    this.extract.on("error", e => {
      this.emit("error", e);
    });

    this.extract.on("finish", () => {
      log("promises", this.promises);
      Promise.all(this.promises).then(arr => {
        log("call finish!");
        const keys = arr.map(a => a.Key);
        this.emit("finish", { keys });
      });
    });
  }

  public end(...args: any[]): void {
    this.extract.end();
  }

  public write(...args: any[]): boolean {
    const [chunk, encoding, callback] =
      args.length === 2 ? [args[0], "utf8", args[1]] : args;

    this.extract.write(chunk, encoding, callback);
    return true;
  }

  private ignore(name: string): boolean {
    return this.ignores.find(r => r.test(name)) !== undefined;
  }

  private onEntry(header, stream: Readable, next: () => void) {
    log("onEntry", header.name);

    stream.on("error", next);
    stream.on("end", () => {
      log("call end for", header.name);
      next();
    });

    if (this.ignore(header.name)) {
      stream.resume();
    } else {
      const p: Promise<S3.ManagedUpload.SendData> = this.s3
        .upload({
          Body: stream,
          Bucket: this.bucket,
          ContentType: lookup(extname(header.name)),
          Key: normalize(`${this.prefix}/${header.name}`)
        })
        .promise();

      this.promises.push(p);
    }
  }
}
