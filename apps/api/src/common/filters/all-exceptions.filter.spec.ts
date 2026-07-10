import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { SalesOrderStatus } from '../../../generated/prisma/client';
import { InvalidStatusTransitionException } from '../exceptions';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost(): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/sales-orders/abc/status' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('mapeia exceção de domínio para o status e o código dela', () => {
    const { host, json, status } = makeHost();

    filter.catch(
      new InvalidStatusTransitionException(SalesOrderStatus.CRIADA, SalesOrderStatus.ENTREGUE),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        error: 'InvalidStatusTransition',
        message: 'Transição de CRIADA para ENTREGUE não é permitida.',
        path: '/api/sales-orders/abc/status',
      }),
    );
  });

  it('mapeia HttpException do Nest preservando o status', () => {
    const { host, json, status } = makeHost();

    filter.catch(new NotFoundException('não achei'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('mapeia erro desconhecido para 500 sem vazar a mensagem interna', () => {
    const { host, json, status } = makeHost();

    filter.catch(new Error('senha do banco vazou aqui'), host);

    expect(status).toHaveBeenCalledWith(500);
    const payload = json.mock.calls[0][0] as { message: string };
    expect(payload.message).toBe('Erro interno do servidor.');
    expect(payload.message).not.toContain('senha');
  });
});
