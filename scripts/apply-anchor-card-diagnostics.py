from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    if old not in text:
        raise RuntimeError(f"Expected block not found in {path}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))


# Carry anchor context through the create-page response/message model.
replace_once(
    "app/create/page.tsx",
    ""