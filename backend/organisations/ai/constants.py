"""
AI provider constants for the organisation AI subsystem.

Keep provider identifiers centralized here so they are reused
consistently throughout the platform.
"""

# Supported AI providers
OPENAI = "openai"
ANTHROPIC = "anthropic"
GOOGLE = "google"
XAI = "xai"
MISTRAL = "mistral"
DEEPSEEK = "deepseek"
AZURE_OPENAI = "azure_openai"

SUPPORTED_PROVIDERS = (
    OPENAI,
    ANTHROPIC,
    GOOGLE,
    XAI,
    MISTRAL,
    DEEPSEEK,
    AZURE_OPENAI,
)

DEFAULT_PROVIDER = OPENAI

# Default models
DEFAULT_OPENAI_MODEL = "gpt-5.5"

DEFAULT_MODELS = {
    OPENAI: DEFAULT_OPENAI_MODEL,
}

# AI feature flags
FEATURE_TRANSLATIONS = "translations"
FEATURE_WHATSAPP = "whatsapp"
FEATURE_SEO = "seo"
FEATURE_DESCRIPTIONS = "descriptions"
FEATURE_SUMMARIZATION = "summarization"
FEATURE_ASSISTANT = "assistant"

SUPPORTED_FEATURES = (
    FEATURE_TRANSLATIONS,
    FEATURE_WHATSAPP,
    FEATURE_SEO,
    FEATURE_DESCRIPTIONS,
    FEATURE_SUMMARIZATION,
    FEATURE_ASSISTANT,
)
