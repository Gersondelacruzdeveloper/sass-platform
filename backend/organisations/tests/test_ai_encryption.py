"""Tests for organisation AI credential encryption helpers."""

from cryptography.fernet import Fernet
from django.test import SimpleTestCase, override_settings

from organisations.ai.encryption import (
    AIEncryptionConfigurationError,
    AISecretDecryptionError,
    ENCRYPTED_VALUE_PREFIX,
    clear_encryption_cache,
    decrypt_secret,
    encrypt_secret,
    get_fernet,
    is_encrypted_secret,
)


class OrganisationAIEncryptionTests(SimpleTestCase):
    def setUp(self):
        clear_encryption_cache()
        self.key = Fernet.generate_key().decode("utf-8")

    def tearDown(self):
        clear_encryption_cache()

    def test_encrypt_and_decrypt_round_trip_without_plaintext_exposure(self):
        secret = "sk-test-secret-value"

        with override_settings(ORGANISATION_AI_ENCRYPTION_KEY=self.key):
            encrypted = encrypt_secret(secret)
            decrypted = decrypt_secret(encrypted)

        self.assertTrue(encrypted.startswith(ENCRYPTED_VALUE_PREFIX))
        self.assertNotEqual(encrypted, secret)
        self.assertNotIn(secret, encrypted)
        self.assertEqual(decrypted, secret)

    def test_encryption_trims_outer_whitespace(self):
        with override_settings(ORGANISATION_AI_ENCRYPTION_KEY=self.key):
            encrypted = encrypt_secret("  secret-with-space  ")

        with override_settings(ORGANISATION_AI_ENCRYPTION_KEY=self.key):
            self.assertEqual(
                decrypt_secret(encrypted),
                "secret-with-space",
            )

    def test_empty_values_do_not_require_key_and_return_empty_string(self):
        with override_settings(ORGANISATION_AI_ENCRYPTION_KEY=""):
            self.assertEqual(encrypt_secret(""), "")
            self.assertEqual(encrypt_secret("   "), "")
            self.assertEqual(decrypt_secret(""), "")
            self.assertEqual(decrypt_secret(None), "")

    def test_missing_encryption_key_raises_safe_configuration_error(self):
        with override_settings(ORGANISATION_AI_ENCRYPTION_KEY=""):
            with self.assertRaises(AIEncryptionConfigurationError) as context:
                encrypt_secret("private-value")

        message = str(context.exception)
        self.assertIn("not configured", message)
        self.assertNotIn("private-value", message)

    def test_invalid_encryption_key_raises_safe_configuration_error(self):
        with override_settings(
            ORGANISATION_AI_ENCRYPTION_KEY="not-a-fernet-key"
        ):
            with self.assertRaises(AIEncryptionConfigurationError) as context:
                encrypt_secret("private-value")

        self.assertIn("valid Fernet key", str(context.exception))
        self.assertNotIn("private-value", str(context.exception))

    def test_plaintext_secret_is_rejected(self):
        with override_settings(ORGANISATION_AI_ENCRYPTION_KEY=self.key):
            with self.assertRaises(AISecretDecryptionError) as context:
                decrypt_secret("sk-plaintext-must-not-be-accepted")

        self.assertIn("not encrypted", str(context.exception))
        self.assertNotIn("sk-plaintext", str(context.exception))

    def test_corrupted_ciphertext_raises_safe_decryption_error(self):
        corrupted = f"{ENCRYPTED_VALUE_PREFIX}not-valid-ciphertext"

        with override_settings(ORGANISATION_AI_ENCRYPTION_KEY=self.key):
            with self.assertRaises(AISecretDecryptionError) as context:
                decrypt_secret(corrupted)

        self.assertIn("could not be decrypted", str(context.exception))
        self.assertNotIn("not-valid-ciphertext", str(context.exception))

    def test_ciphertext_cannot_be_decrypted_with_different_key(self):
        with override_settings(ORGANISATION_AI_ENCRYPTION_KEY=self.key):
            encrypted = encrypt_secret("key-specific-secret")

        clear_encryption_cache()
        other_key = Fernet.generate_key().decode("utf-8")

        with override_settings(ORGANISATION_AI_ENCRYPTION_KEY=other_key):
            with self.assertRaises(AISecretDecryptionError):
                decrypt_secret(encrypted)

    def test_is_encrypted_secret_recognizes_only_supported_prefix(self):
        self.assertTrue(
            is_encrypted_secret(f"{ENCRYPTED_VALUE_PREFIX}ciphertext")
        )
        self.assertFalse(is_encrypted_secret("ciphertext"))
        self.assertFalse(is_encrypted_secret("fernet:v2:ciphertext"))
        self.assertFalse(is_encrypted_secret(""))
        self.assertFalse(is_encrypted_secret(None))

    def test_get_fernet_is_cached_until_explicitly_cleared(self):
        with override_settings(ORGANISATION_AI_ENCRYPTION_KEY=self.key):
            first = get_fernet()
            second = get_fernet()
            self.assertIs(first, second)

            clear_encryption_cache()
            third = get_fernet()

        self.assertIsNot(first, third)
