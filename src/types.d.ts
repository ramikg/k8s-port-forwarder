export interface Directory {
    displayName: string;
    context: string;
    resources: Resource[];
}

export interface Resource {
    type: string;
    namespace: string;
    name: string;
    localPort: number;
    remotePort: number;
    // The previous fields are part of the resource configuration, and the context is taken from the directory configuration.
    context: string;
}
