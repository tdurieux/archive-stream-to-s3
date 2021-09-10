import { S3 } from "aws-sdk";
import { Writable, Readable, pipeline } from "stream";
import * as tar from "tar-stream";
import * as unzip from "unzip-stream";
import { promisify } from "util";
import * as debug from "debug";
import { lookup } from "mime-types";
import { extname, normalize } from "path";
import * as gunzip from "gunzip-maybe";

const log = debug("archive-stream-to-s3");

interface Option {
  bucket: string;
  prefix: string;
  s3: S3;
  type?: "tar" | "zip";
  ignores?: RegExp[];
  onEntry?: (
    header: { name: string; type: "file" | "directory"; size: number },
    stream: Readable
  ) => void;
}
interface OptionPromise extends Option {
  stream: Readable;
}
export const promise = (opt: OptionPromise): Promise<any> => {
  const pipe = promisify(pipeline);
  const toS3 = new ArchiveStreamToS3(opt);
  return pipe(opt.stream, gunzip, toS3);
};

export class ArchiveStreamToS3 extends Writable {
  private tarExtract?: Writable;
  private zipExtract?: NodeJS.WritableStream & NodeJS.ReadableStream;
  private promises: Promise<S3.ManagedUpload.SendData>[];
  constructor(private readonly opt: Option) {
    super();
    if (opt.type === "zip") {
      this.zipExtract = unzip.Parse();
      this.zipExtract.on("entry", this.onZipEntry.bind(this));
      this.zipExtract.on("error", this.onError.bind(this));
      this.zipExtract.on("finish", this.onFinish.bind(this));
    } else {
      this.tarExtract = tar.extract();
      this.tarExtract.on("entry", this.onEntry.bind(this));
      this.tarExtract.on("error", this.onError.bind(this));
      this.tarExtract.on("finish", this.onFinish.bind(this));
    }
    this.promises = [];
  }

  public end(...args: any[]): void {
    if (this.opt.type === "zip") {
      this.zipExtract.end();
    } else {
      this.tarExtract.end();
    }
  }

  public write(...args: any[]): boolean {
    const [chunk, encoding, callback] =
      args.length === 2 ? [args[0], "utf8", args[1]] : args;

    if (this.opt.type === "zip") {
      this.zipExtract.write(chunk, encoding, callback);
    } else {
      this.tarExtract.write(chunk, encoding, callback);
    }
    return true;
  }

  private onFinish() {
    log("promises", this.promises);
    Promise.all(this.promises).then((arr) => {
      log("call finish!");
      const keys = arr.map((a) => a.Key);
      this.emit("finish", { keys });
    });
  }

  private onError(e) {
    this.emit("error", e);
  }

  private ignore(name: string): boolean {
    if (this.opt.ignores) {
      return this.opt.ignores.find((r) => r.test(name)) !== undefined;
    }
    return false;
  }

  private onZipEntry(entry: unzip.Entry) {
    const header = {
      name: entry.path,
      type: (entry.type === "Directory" ? "directory" : "file") as
        | "directory"
        | "file",
      size: entry.size,
    };
    log("onEntry", entry.path);
    if (this.opt.onEntry) {
      this.opt.onEntry(header, entry);
    }
    entry.on("error", this.onEntry);
    entry.on("end", () => {
      log("call end for", header.name);
    });
    if (entry.type === "Directory" || this.ignore(header.name)) {
      return entry.autodrain();
    }
    const contentType = lookup(extname(header.name));

    const params: S3.PutObjectRequest = {
      Body: entry,
      Bucket: this.opt.bucket,
      Key: normalize(`${this.opt.prefix}/${header.name}`),
    };

    if (contentType) {
      params.ContentType = contentType;
    }
    const p: Promise<S3.ManagedUpload.SendData> = this.opt.s3
      .upload(params)
      .promise();

    this.promises.push(p);
  }

  private onEntry(header, stream: Readable, next: () => void) {
    log("onEntry", header.name);
    if (this.opt.onEntry) {
      this.opt.onEntry(header, stream);
    }

    stream.on("error", next);
    stream.on("end", () => {
      log("call end for", header.name);
      next();
    });
    if (header.type === "directory" || this.ignore(header.name)) {
      stream.resume();
    } else {
      const contentType = lookup(extname(header.name));

      const params: any = {
        Body: stream,
        Bucket: this.opt.bucket,
        Key: normalize(`${this.opt.prefix}/${header.name}`),
      };

      if (contentType) {
        params.ContentType = contentType;
      }
      const p: Promise<S3.ManagedUpload.SendData> = this.opt.s3
        .upload(params)
        .promise();

      this.promises.push(p);
    }
  }
}
