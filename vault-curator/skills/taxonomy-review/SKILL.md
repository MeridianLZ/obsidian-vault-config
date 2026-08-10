---
name: taxonomy-review
description: Monthly tag-taxonomy review — diff the tag registry against actual usage
  (tag_index) and emergent structure (communities); emit merge/retire/add proposals
  with scope notes. Use for the monthly taxonomy review or when tag drift is suspected.
---
# Taxonomy Review

Taxonomy evolves by evidence, never ad hoc. This skill produces PROPOSALS — applying
them is a Curator-gated schema mutation (registry changes need human ratification).

1. **Gather evidence**: `tag_index` (full, with rollups) vs `00-system/schema/tag-registry.md`;
   `communities` output for emergent clusters the registry doesn't name.
2. **Classify each finding**:
   - unregistered tag in use → *add proposal* (with scope note) or *merge proposal*
     into the nearest registered tag — decide by usage count and semantic overlap
   - registered tag with zero usage for 90+ days → *retire proposal*
   - two tags with near-identical member sets → *merge proposal* (state the survivor)
   - a `communities` cluster ≥5 notes with no covering `#domain/` tag → *add proposal*
3. **Every proposal carries**: the evidence (counts, example notes), the exact registry
   diff, and a migration note (which notes get retagged, by whom).
4. Emit the report to `${COPILOT_PLUGIN_DATA}/reports/taxonomy-<YYYY-MM>.json` and table
   the proposals as `type: system` decision notes via the gate for human sign-off.
