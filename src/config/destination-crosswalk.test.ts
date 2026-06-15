import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESTINATION_CROSSWALK,
  resolveDestinationToken,
  crosswalkByCoreId,
  coreIdToBackofficeDestinationId,
  resolveBackofficeDestinationId
} from './destination-crosswalk.js';

test('resolves tokens by core id, jvto-web id, slug, name, and alias', () => {
  assert.equal(resolveDestinationToken('ijen'), 'ijen');
  assert.equal(resolveDestinationToken('ijen-crater'), 'ijen'); // jvto-web slug
  assert.equal(resolveDestinationToken('Kawah Ijen'), 'ijen'); // alias, case-insensitive
  assert.equal(resolveDestinationToken('Mount Bromo'), 'bromo'); // name
  assert.equal(resolveDestinationToken('tumpak-sewu-waterfall'), 'tumpak_sewu'); // slug -> core id differs
  assert.equal(resolveDestinationToken('unknown place'), null);
});

test('core ids align with generated dataset destination ids', () => {
  const required = ['bromo', 'ijen', 'tumpak_sewu', 'madakaripura', 'papuma', 'malang_batu', 'surabaya_city', 'bali_ketapang'];
  const present = new Set(DESTINATION_CROSSWALK.map((e) => e.coreId));
  for (const id of required) {
    assert.ok(present.has(id), `crosswalk missing core id ${id}`);
  }
});

test('numeric backoffice ids are only ever placeholders/unknown (none verified yet)', () => {
  for (const e of DESTINATION_CROSSWALK) {
    if (e.backofficeDestinationId != null) {
      assert.equal(e.backofficeIdProvenance, 'fixture_placeholder_unverified');
    } else {
      assert.equal(e.backofficeIdProvenance, 'unknown');
    }
    assert.notEqual(e.backofficeIdProvenance, 'verified');
  }
});

test('lookup helpers return crosswalk data', () => {
  assert.equal(crosswalkByCoreId('bromo')?.slug, 'mount-bromo');
  assert.equal(coreIdToBackofficeDestinationId('bromo'), 2);
  assert.equal(coreIdToBackofficeDestinationId('tumpak_sewu'), null);
  assert.equal(crosswalkByCoreId('nope'), null);
});

test('registry slug join verifies the backoffice destination id', () => {
  const registry = [
    { id: 2, slug: 'mount-bromo' },
    { id: 5, slug: 'ijen-crater' }
  ];
  const bromo = resolveBackofficeDestinationId('bromo', registry);
  assert.equal(bromo.backofficeDestinationId, 2);
  assert.equal(bromo.provenance, 'verified');

  // tumpak_sewu absent from this registry -> falls back to static (unknown)
  const tumpak = resolveBackofficeDestinationId('tumpak_sewu', registry);
  assert.equal(tumpak.backofficeDestinationId, null);
  assert.equal(tumpak.provenance, 'unknown');
});

test('without a registry, resolver returns the static placeholder', () => {
  const bromo = resolveBackofficeDestinationId('bromo');
  assert.equal(bromo.backofficeDestinationId, 2);
  assert.equal(bromo.provenance, 'fixture_placeholder_unverified');
});

test('registry id overrides a stale placeholder when slug matches', () => {
  // export says ijen-crater is id 99 (not the fixture placeholder 5)
  const resolved = resolveBackofficeDestinationId('ijen', [{ id: 99, slug: 'ijen-crater' }]);
  assert.equal(resolved.backofficeDestinationId, 99);
  assert.equal(resolved.provenance, 'verified');
});
