const KIB = 1_024
const MIB = 1_048_576

export const formatBytes = (bytes: number) => {
    if (bytes < KIB) {
        return `${bytes} B`
    }
    if (bytes < MIB) {
        return `${(bytes / KIB).toFixed(1)} KiB`
    }
    return `${(bytes / MIB).toFixed(1)} MiB`
}
