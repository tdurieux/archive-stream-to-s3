import { PutObjectCommand, PutObjectRequest, S3 } from "@aws-sdk/client-s3";
import { Writable, Readable, pipeline } from "stream";
import * as tar from "tar-stream";
import * as unzip from "unzip-stream";
import { promisify } from "util";
import * as debug from "debug";
import { lookup } from "mime-types";
import { extname, normalize } from "path";
import * as gunzip from "gunzip-maybe";

const log = debug("archive-stream-to-s3");

interface Header {
  name: string;
  type: "directory" | "file";
  size: number;
  Tagging?: string;
  Metadata?: Record<string, string>;
}

interface Option {
  bucket: string;
  prefix: string;
  s3: S3;
  type?: "tar" | "zip";
  ignores?: RegExp[];
  onEntry?: (header: Header, stream: Readable) => void;
}
interface OptionPromise extends Option {
  stream: Readable;
}

export default class ArchiveStreamToS3
  extends Writable
  implements NodeJS.WritableStream
{
  private tarExtract?: Writable;
  private zipExtract?: NodeJS.WritableStream & NodeJS.ReadableStream;
  private promises: Promise<any>[];
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

  public static promise(opt: OptionPromise) {
    const pipe = promisify(pipeline);
    const toS3 = new ArchiveStreamToS3(opt);
    return pipe(opt.stream, gunzip, toS3);
  }

  public end(_?: any): any {
    if (this.opt.type === "zip") {
      this.zipExtract.end();
    } else {
      this.tarExtract.end();
    }
    return this as any;
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
    Promise.all(this.promises).then(
      (arr) => {
        const keys = arr.map((a) => a.Key);
        this.emit("finish", { keys });
      },
      (err) => {
        this.emit("error", err);
      }
    );
  }

  private onError(e: any) {
    this.emit("error", e);
  }

  private ignore(name: string): boolean {
    if (this.opt.ignores) {
      return this.opt.ignores.find((r) => r.test(name)) !== undefined;
    }
    return false;
  }

  private onZipEntry(entry: unzip.Entry) {
    const header: Header = {
      name: entry.path,
      type: entry.type === "Directory" ? "directory" : "file",
      size: entry.size,
    };
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

    const params: PutObjectRequest = {
      Body: entry,
      Bucket: this.opt.bucket,
      Key: normalize(`${this.opt.prefix}/${header.name}`),
      Tagging: header.Tagging,
      Metadata: header.Metadata,
    };

    const contentType = lookup(extname(header.name));
    if (contentType) {
      params.ContentType = contentType;
    }

    this.promises.push(this.opt.s3.putObject(params));
  }

  private onEntry(header: Header, stream: Readable, next: () => void) {
    if (this.opt.onEntry) {
      this.opt.onEntry(header, stream);
    }

    stream.on("error", next);
    stream.on("end", () => {
      next();
    });

    if (header.type === "directory" || this.ignore(header.name)) {
      stream.resume();
    } else {
      const contentType = lookup(extname(header.name));

      const params: PutObjectRequest = {
        Body: stream,
        Bucket: this.opt.bucket,
        Key: normalize(`${this.opt.prefix}/${header.name}`),
      };

      if (contentType) {
        params.ContentType = contentType;
      }
      const command = new PutObjectCommand(params);
      this.promises.push(this.opt.s3.send(command));
    }
  }
}
