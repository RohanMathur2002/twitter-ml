from utils.text import clean_social_text


class PreprocessingService:
    """Text preprocessing routines used before embedding and prediction."""

    def clean(self, text: str) -> str:
        return clean_social_text(text)

    def clean_batch(self, texts: list[str]) -> list[str]:
        return [self.clean(text) for text in texts]

