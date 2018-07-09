import * as tar from "tar-stream";

export const createStream = (data: any) => {
  const pack = tar.pack(); // pack is a streams2 stream

  Object.keys(data).forEach((k: string) => {
    pack.entry({ name: k }, data[k]);
  });

  pack.finalize();
  return pack;
};
