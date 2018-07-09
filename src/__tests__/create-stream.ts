import * as tar from "tar-stream";

export const createStream = () => {
  const pack = tar.pack(); // pack is a streams2 stream
  pack.entry({ name: "my-test.txt" }, "Hello World!");
  pack.entry({ name: "two.txt" }, "Hello World!!!");
  pack.finalize();
  return pack;
};
