import re


_WHITESPACE_RE = re.compile(r"\s+")
_URL_RE = re.compile(r"https?://\S+|www\.\S+", flags=re.IGNORECASE)
_MENTION_RE = re.compile(r"(?<!\w)@\w+")


def normalize_whitespace(text: str) -> str:
    """Collapse repeated whitespace and trim surrounding spaces."""

    return _WHITESPACE_RE.sub(" ", text).strip()


def clean_social_text(text: str) -> str:
    """Clean tweet-like text while preserving semantically useful content."""

    without_urls = _URL_RE.sub(" ", text)
    without_mentions = _MENTION_RE.sub(" ", without_urls)
    normalized = normalize_whitespace(without_mentions)
    return normalized

