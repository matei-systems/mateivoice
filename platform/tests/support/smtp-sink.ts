import net from "node:net";

/**
 * Minimaler SMTP-Empfänger NUR für Tests (lokal, ohne TLS/Auth). Nimmt Nachrichten
 * entgegen und speichert sie im Speicher – es wird nichts weitergeleitet.
 */
export type SinkMessage = { from: string; to: string[]; data: string };

export async function startSmtpSink() {
  const messages: SinkMessage[] = [];
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    let inData = false;
    let current: SinkMessage = { from: "", to: [], data: "" };
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220 sink.test ESMTP");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let index: number;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            messages.push(current);
            current = { from: "", to: [], data: "" };
            reply("250 OK: queued");
          } else {
            current.data += `${line.startsWith("..") ? line.slice(1) : line}\n`;
          }
          continue;
        }
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
          socket.write("250-sink.test\r\n250 8BITMIME\r\n");
        } else if (upper.startsWith("MAIL FROM:")) {
          current.from = line.slice(10).trim();
          reply("250 OK");
        } else if (upper.startsWith("RCPT TO:")) {
          current.to.push(line.slice(8).trim());
          reply("250 OK");
        } else if (upper === "DATA") {
          inData = true;
          reply("354 End data with <CR><LF>.<CR><LF>");
        } else if (upper === "QUIT") {
          reply("221 Bye");
          socket.end();
        } else if (upper === "RSET" || upper === "NOOP") {
          reply("250 OK");
        } else {
          reply("502 Command not implemented");
        }
      }
    });
    socket.on("error", () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    messages,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
