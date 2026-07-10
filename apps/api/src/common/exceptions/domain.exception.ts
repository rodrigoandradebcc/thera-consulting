export abstract class DomainException extends Error {
  abstract readonly status: number;
  abstract readonly error: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
