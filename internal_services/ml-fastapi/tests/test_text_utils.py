from utils.text import clean_social_text, normalize_whitespace


def test_normalize_whitespace_collapses_repeated_spaces() -> None:
    assert normalize_whitespace("  hello   world  ") == "hello world"


def test_clean_social_text_removes_urls_and_mentions() -> None:
    assert clean_social_text("@user hello https://example.com") == "hello"

