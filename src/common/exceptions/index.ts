import { SalesOrderStatus } from '../../../generated/prisma/client';
import { DomainException } from './domain.exception';

export { DomainException };

export class EntityNotFoundException extends DomainException {
  readonly status = 404;
  readonly error = 'EntityNotFound';

  constructor(entity: string, id: string) {
    super(`${entity} com id ${id} não foi encontrado.`);
  }
}

export class InvalidStatusTransitionException extends DomainException {
  readonly status = 409;
  readonly error = 'InvalidStatusTransition';

  constructor(from: SalesOrderStatus, to: SalesOrderStatus) {
    super(`Transição de ${from} para ${to} não é permitida.`);
  }
}

export class TransportTypeNotAllowedException extends DomainException {
  readonly status = 409;
  readonly error = 'TransportTypeNotAllowed';

  constructor(customerId: string, transportTypeId: string) {
    super(
      `Tipo de transporte ${transportTypeId} não está autorizado para o cliente ${customerId}.`,
    );
  }
}

export class ScheduleAlreadyExistsException extends DomainException {
  readonly status = 409;
  readonly error = 'ScheduleAlreadyExists';

  constructor(salesOrderId: string) {
    super(`A ordem de venda ${salesOrderId} já possui agendamento.`);
  }
}

export class ScheduleAlreadyConfirmedException extends DomainException {
  readonly status = 409;
  readonly error = 'ScheduleAlreadyConfirmed';

  constructor(salesOrderId: string) {
    super(`O agendamento da ordem de venda ${salesOrderId} já está confirmado.`);
  }
}

export class SlotUnavailableException extends DomainException {
  readonly status = 409;
  readonly error = 'SlotUnavailable';

  constructor(date: string, window: string) {
    super(`Não há capacidade disponível em ${date} na janela ${window}.`);
  }
}

export class OrderNotSchedulableException extends DomainException {
  readonly status = 409;
  readonly error = 'OrderNotSchedulable';

  constructor(message: string) {
    super(message);
  }
}
