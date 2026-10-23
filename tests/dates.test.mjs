import test from 'node:test';import assert from 'node:assert/strict';import {jalaliToISO,formatDate,persianParts} from '../dist/dates.js';
test('Nowruz and Persian digits convert without the browser timezone',()=>{assert.equal(jalaliToISO('۱۴۰۵/۰۱/۰۱','09:30'),'2026-03-21T09:30');assert.deepEqual(persianParts('2026-10-23T12:00:00Z'),{year:1405,month:8,day:1})});
test('invalid dates and leap days are validated',()=>{assert.equal(jalaliToISO('1404/12/30'),null);assert.equal(jalaliToISO('1403/12/30'),'2025-03-20T12:00');assert.equal(jalaliToISO('1405/07/31'),null);assert.equal(jalaliToISO('1405/08/01','25:00'),null)});
test('display always uses Persian calendar and Tehran date',()=>{assert.match(formatDate('2026-10-23T12:00:00Z'),/۱۴۰۵/);assert.equal(formatDate('invalid'),'نامشخص')});
