const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createTokenVault} = require('../electron/credentials.cjs');

test('Linux tokens use the selected system keyring and round-trip as base64', async () => {
  const calls = [];
  const vault = createTokenVault({
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: secret => {calls.push(secret); return Buffer.from('encrypted-fixture');},
    decryptString: data => {assert.equal(data.toString(), 'encrypted-fixture'); return 'fixture-only';}
  }, 'linux');
  const encoded = await vault.encrypt('fixture-only');
  assert.equal(encoded, Buffer.from('encrypted-fixture').toString('base64'));
  assert.equal(await vault.decrypt(encoded), 'fixture-only');
  assert.deepEqual(calls, ['fixture-only']);
});

for (const backend of ['basic_text', 'unknown', 'unrecognised']) {
  test(`Linux refuses ${backend} before encrypting or decrypting`, async () => {
    const vault = createTokenVault({
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => backend,
      encryptString: () => assert.fail('insecure encryption'),
      decryptString: () => assert.fail('insecure decryption')
    }, 'linux');
    await assert.rejects(vault.encrypt('must-not-leak'), /GNOME Keyring/);
    await assert.rejects(vault.decrypt('YQ=='), /GNOME Keyring/);
  });
}

test('a locked or missing keyring does not produce ciphertext', async () => {
  const vault = createTokenVault({isEncryptionAvailable: () => false}, 'linux');
  await assert.rejects(vault.encrypt('fixture-only'), /Разблокируйте/);
});

test('Windows keeps the asynchronous DPAPI-compatible token format', async () => {
  const encrypted = Buffer.from('existing-windows-ciphertext');
  const vault = createTokenVault({
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async secret => {assert.equal(secret, 'fixture-only'); return encrypted;},
    decryptStringAsync: async data => {assert.deepEqual(data, encrypted); return {result: 'fixture-only'};}
  }, 'win32');
  assert.equal(await vault.encrypt('fixture-only'), encrypted.toString('base64'));
  assert.equal(await vault.decrypt(encrypted.toString('base64')), 'fixture-only');
});

test('unavailable Windows encryption fails without attempting a write', async () => {
  const vault = createTokenVault({isAsyncEncryptionAvailable: async () => false}, 'win32');
  await assert.rejects(vault.encrypt('fixture-only'), /хранилище системы/);
});
