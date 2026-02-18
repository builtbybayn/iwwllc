export function log(level, message, data = {}) {
    // Redact tokens in logs
    const safeData = { ...data };
    if (safeData.token) {
        safeData.token = `...${safeData.token.slice(-4)}`;
    }

    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...safeData
    }));
}
