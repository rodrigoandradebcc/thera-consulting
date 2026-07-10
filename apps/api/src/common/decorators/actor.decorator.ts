import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Não há autenticação neste desafio. O ator vem do header X-Actor.
 * Trocar por um `sub` de JWT depois é uma mudança de uma linha.
 */
export const Actor = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const header = request.header('X-Actor');
  return header !== undefined && header.trim().length > 0 ? header.trim() : 'system';
});
