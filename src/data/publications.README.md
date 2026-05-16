# Publications data

`publications.generated.json` is written by `npm run fetch:publications`.

`publications.manual.json` is for papers that are missing from ORCID or need to be
shown before indexing catches up.

```json
{
  "items": [
    {
      "id": "manual:short-stable-id",
      "category": "conference",
      "title": "Paper title",
      "authors": ["Han Wang", "Coauthor Name"],
      "venue": "Conference or journal name",
      "year": "2026",
      "pages": "1-8",
      "note": "To appear",
      "links": {
        "doi": "https://doi.org/...",
        "arxiv": "https://arxiv.org/abs/...",
        "pdf": "/papers/example.pdf",
        "code": "https://github.com/..."
      }
    }
  ]
}
```

Allowed `category` values:

- `journal`
- `conference`
- `book-chapter`
- `preprint`
- `other`

`publications.overrides.json` is for correcting generated ORCID entries without
editing the generated file. Use the publication `id` as the key:

```json
{
  "doi:10.0000/example": {
    "category": "journal",
    "venue": "IEEE Transactions on Automatic Control",
    "links": {
      "pdf": "/papers/example.pdf"
    }
  }
}
```
