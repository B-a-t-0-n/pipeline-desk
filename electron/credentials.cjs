const LINUX_BACKENDS = new Set(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']);

function createTokenVault(safeStorage, platform = process.platform) {
  function requireLinuxKeyring() {
    // The Linux synchronous API exposes its backend. Do not persist a token
    // using basic_text (a hardcoded password) or an unidentified backend.
    if (!safeStorage.isEncryptionAvailable() ||
        !LINUX_BACKENDS.has(safeStorage.getSelectedStorageBackend())) {
      throw new Error('Системное хранилище секретов недоступно. Разблокируйте GNOME Keyring или KWallet и повторите подключение.');
    }
  }

  return {
    async encrypt(secret) {
      if (platform === 'linux') {
        requireLinuxKeyring();
        return safeStorage.encryptString(secret).toString('base64');
      }
      if (!await safeStorage.isAsyncEncryptionAvailable()) {
        throw new Error('Защищённое хранилище системы недоступно.');
      }
      return (await safeStorage.encryptStringAsync(secret)).toString('base64');
    },
    async decrypt(encoded) {
      const encrypted = Buffer.from(encoded, 'base64');
      if (platform === 'linux') {
        requireLinuxKeyring();
        return safeStorage.decryptString(encrypted);
      }
      return (await safeStorage.decryptStringAsync(encrypted)).result;
    }
  };
}

module.exports = {createTokenVault};
