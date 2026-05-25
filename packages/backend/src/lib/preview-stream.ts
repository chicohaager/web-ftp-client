import { Writable } from 'stream';

// Writable that collects UTF-8 text up to `maxBytes`, then signals the upstream
// to stop. Used by FTP/SFTP previewers so we never buffer more than the cap
// into memory and we abort the transfer early once the cap is reached.
export class CappedBufferWritable extends Writable {
  private chunks: Buffer[] = [];
  private _total = 0;
  private _truncated = false;

  constructor(private readonly maxBytes: number) {
    super();
  }

  get total(): number { return this._total; }
  get truncated(): boolean { return this._truncated; }
  asString(): string { return Buffer.concat(this.chunks).toString('utf8'); }

  _write(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null) => void): void {
    if (this._total >= this.maxBytes) {
      this._truncated = true;
      cb();
      this.destroy();
      return;
    }
    const remaining = this.maxBytes - this._total;
    if (chunk.length > remaining) {
      this.chunks.push(chunk.subarray(0, remaining));
      this._total += remaining;
      this._truncated = true;
      cb();
      this.destroy();
    } else {
      this.chunks.push(chunk);
      this._total += chunk.length;
      cb();
    }
  }
}
