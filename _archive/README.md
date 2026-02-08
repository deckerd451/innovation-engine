# Archive Directory

This directory contains folders that have been quarantined from the main repository. All archived content is preserved in git history and can be restored at any time.

## Purpose

The `_archive/` directory serves as a git-backed quarantine for:
- Empty or unused folders
- Legacy code no longer referenced
- Experimental features that were abandoned
- Development-only files not needed in production

## Important Notes

⚠️ **Nothing is deleted** - All content is preserved in git history  
✅ **Fully reversible** - Any folder can be restored via git  
📝 **Well documented** - Each archived folder has an ARCHIVE_INFO.md  
🔒 **Safe** - No application code or active assets are archived  

## Archived Folders

| Date | Folder | Original Location | Reason | Risk Level |
|------|--------|-------------------|--------|------------|
| 2026-02-08 | `migrations/` | `/migrations/` | Empty folder, SQL moved to `supabase/sql/` | None |

## Restoring Archived Content

### Restore a specific folder

```bash
# Restore migrations folder
git mv _archive/2026-02-08_migrations migrations
git commit -m "Restore migrations folder"
```

### Restore all archived content

```bash
# Restore everything
for dir in _archive/2026-02-08_*; do
  folder=$(basename "$dir" | sed 's/2026-02-08_//')
  git mv "$dir" "$folder"
done
git commit -m "Restore all archived folders"
```

### Full rollback via git

```bash
# Revert the quarantine commit
git revert <commit-hash>
```

## Archive Structure

Each archived folder follows this structure:

```
_archive/
└── YYYY-MM-DD_foldername/
    ├── ARCHIVE_INFO.md          # Why archived, when, by whom
    └── [original contents]       # Preserved exactly as-is
```

## Guidelines

### What Gets Archived

✅ Empty folders  
✅ Unused legacy code  
✅ Development-only test files (after verification)  
✅ Experimental features no longer in use  
✅ IDE-specific configuration (optional)  

### What Does NOT Get Archived

❌ Active application code  
❌ Referenced assets (images, CSS, JS)  
❌ Documentation in use  
❌ Configuration files in use  
❌ Anything with uncertain purpose  

## Safety Checklist

Before archiving any folder:

- [ ] Verified no references in HTML files
- [ ] Verified no references in JavaScript files
- [ ] Verified no dynamic imports or fetch calls
- [ ] Checked folder contents
- [ ] Assessed risk level
- [ ] Created ARCHIVE_INFO.md
- [ ] Tested application after archiving
- [ ] Committed changes with clear message

## Contact

If you need to restore archived content or have questions:
- Check git history: `git log --all --full-history -- _archive/`
- Review ARCHIVE_INFO.md in each archived folder
- Contact repository maintainers

---

**Last Updated**: February 8, 2026  
**Total Archived Folders**: 1  
**Total Archived Files**: 0 (migrations was empty)
