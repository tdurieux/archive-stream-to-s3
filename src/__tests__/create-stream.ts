import * as tar from "tar-stream";
import * as JSZip from "jszip";
import { Readable } from "stream";

export const createTarStream = (data: any) => {
  const pack = tar.pack(); // pack is a streams2 stream

  Object.keys(data).forEach((k: string) => {
    pack.entry({ name: k }, data[k]);
  });

  pack.finalize();
  return pack;
};

export const createZipStream = (data: any) => {
  // create a zip file
  const zip = new JSZip();
  Object.keys(data).forEach((k: string) => {
    zip.file(k, data[k]);
  });
  return zip.generateNodeStream({ type: "nodebuffer", streamFiles: false });
};

export function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on("data", (chunk: any) => chunks.push(chunk));
    stream.on("error", (err: any) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
