import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/** Socket.io with the same CORS origins as the HTTP API (the web panel). */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: readonly string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const merged = {
      ...options,
      path: '/socket.io',
      cors: { origin: [...this.corsOrigins], credentials: true },
      // Slow mobile networks: give clients time before calling them gone.
      pingInterval: 25_000,
      pingTimeout: 30_000,
      maxHttpBufferSize: 64 * 1024,
    } as ServerOptions;
    return super.createIOServer(port, merged) as Server;
  }
}
