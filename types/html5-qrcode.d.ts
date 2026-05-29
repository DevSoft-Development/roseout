declare module "html5-qrcode" {
  export class Html5Qrcode {
    constructor(elementId: string);
    start(
      cameraConfig: { facingMode?: string } | string,
      configuration: {
        fps?: number;
        qrbox?: { width: number; height: number };
        aspectRatio?: number;
      },
      qrCodeSuccessCallback: (decodedText: string, decodedResult?: unknown) => void | Promise<void>,
      qrCodeErrorCallback?: (errorMessage: string, error?: unknown) => void,
    ): Promise<void>;
    stop(): Promise<void>;
    clear(): Promise<void>;
  }
}
