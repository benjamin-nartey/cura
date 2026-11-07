import { assertLocalHealthcareSandbox } from "./experimental-healthcare";

export type GatewayAdapterInput = {
  traceId: string;
  promptId: string;
  promptVersion: number;
  redactedInput: string;
  deadlineAt?: number;
};

type ProviderModel = {
  provider: string;
  modelId: string;
  modelVersion: string;
};

export type GatewayAdapter = ProviderModel & {
  contractVersion?: 1;
  invoke: (input: GatewayAdapterInput) => unknown;
};

export type ProviderRequest = Readonly<GatewayAdapterInput & ProviderModel & {
  contractVersion: 1;
  dataClass: "synthetic";
}>;

export type ProviderOutput = { citations: string[]; text?: string };

export type ProviderResponse = ProviderModel & {
  contractVersion: 1;
  traceId: string;
  output: ProviderOutput;
};

export class InvalidProviderResponse extends Error {}

const modelToken = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const approvedAdapters = new WeakSet<GatewayAdapter>();

export function isVersionedProvider(value: GatewayAdapter) {
  return approvedAdapters.has(value);
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidProviderResponse();
  }
  return value as Record<string, unknown>;
}

function parseOutput(value: unknown): ProviderOutput {
  const output = object(value);
  if (Object.keys(output).some(key => key !== "citations" && key !== "text")) {
    throw new InvalidProviderResponse();
  }
  const citations = output.citations;
  const text = output.text;
  if (!Array.isArray(citations) || citations.length < 1 || citations.length > 32
      || citations.some(citation => typeof citation !== "string" || citation.trim().length === 0 || citation.length > 160)
      || (text !== undefined && (typeof text !== "string" || text.length > 2000))) {
    throw new InvalidProviderResponse();
  }
  return {citations: [...citations], ...(text === undefined ? {} : {text})};
}

function adapter(model: ProviderModel, call: (request: ProviderRequest) => unknown) {
  const {provider, modelId, modelVersion} = model;
  if (![provider, modelId, modelVersion].every(value => typeof value === "string" && modelToken.test(value))) {
    throw new TypeError("Invalid gateway provider model identity.");
  }
  const configured = Object.freeze({
    provider,
    modelId,
    modelVersion,
    contractVersion: 1 as const,
    invoke(input: GatewayAdapterInput) {
      assertLocalHealthcareSandbox();
      const {traceId, promptId, promptVersion, redactedInput, deadlineAt} = input;
      if (!/^trc_[a-f0-9-]{36}$/.test(traceId) || !modelToken.test(promptId)
          || !Number.isSafeInteger(promptVersion) || promptVersion < 1
          || typeof redactedInput !== "string" || redactedInput.trim().length === 0 || redactedInput.length > 4000) {
        throw new TypeError("Invalid gateway provider request.");
      }
      const request: ProviderRequest = Object.freeze({
        contractVersion: 1, dataClass: "synthetic", provider, modelId, modelVersion,
        traceId, promptId, promptVersion, redactedInput,
        ...(deadlineAt === undefined ? {} : {deadlineAt}),
      });
      return parseOutput(call(request));
    },
  });
  approvedAdapters.add(configured);
  return configured;
}

export function createLocalProvider(model: ProviderModel, run: (request: ProviderRequest) => ProviderOutput) {
  return adapter(model, run);
}

/** The gateway owns the relay. A synchronous exchange keeps the existing caller contract. */
export function createHostedProvider(model: ProviderModel, exchange: (requestJson: string, deadlineAt?: number) => string) {
  return adapter(model, request => {
    const {deadlineAt,...envelope} = request;
    const raw = exchange(JSON.stringify(envelope),deadlineAt);
    if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 16384) {
      throw new InvalidProviderResponse();
    }
    let response: Record<string, unknown>;
    try {
      response = object(JSON.parse(raw));
    } catch {
      throw new InvalidProviderResponse();
    }
    if (Object.keys(response).length !== 6 || response.contractVersion !== 1
        || response.traceId !== request.traceId || response.provider !== request.provider
        || response.modelId !== request.modelId || response.modelVersion !== request.modelVersion
        || !Object.hasOwn(response, "output")) {
      throw new InvalidProviderResponse();
    }
    return response.output;
  });
}
