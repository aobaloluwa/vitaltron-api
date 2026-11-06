import { Injectable } from '@nestjs/common';
import { RecordType } from '../../generated/prisma/enums';

@Injectable()
export class FhirSerializerService {
  serializePatientBundle(patient: any, records: any[]) {
    const bundleEntries: any[] = [];

    const patientResource = {
      fullUrl: `urn:uuid:${patient.id}`,
      resource: {
        resourceType: 'Patient',
        id: patient.id,
        name: [
          {
            use: 'official',
            text: patient.displayName || 'Unknown Name',
          },
        ],
        telecom: patient.email ? [{ system: 'email', value: patient.email }] : [],
        gender: patient.patientProfile?.gender?.toLowerCase() || 'unknown',
        birthDate: patient.patientProfile?.dateOfBirth ? new Date(patient.patientProfile.dateOfBirth).toISOString().split('T')[0] : undefined,
      },
    };
    bundleEntries.push(patientResource);

    for (const record of records) {
      const entryId = `urn:uuid:${record.id}`;

      switch (record.type) {
        case RecordType.DIAGNOSIS:
          bundleEntries.push({
            fullUrl: entryId,
            resource: {
              resourceType: 'Condition',
              id: record.id,
              subject: { reference: `urn:uuid:${patient.id}` },
              code: { text: record.title },
              clinicalStatus: { coding: [{ code: record.status?.toLowerCase() || 'active' }] },
              recordedDate: record.eventDate,
              note: record.description ? [{ text: record.description }] : [],
            },
          });
          break;

        case RecordType.MEDICATION:
          bundleEntries.push({
            fullUrl: entryId,
            resource: {
              resourceType: 'MedicationStatement',
              id: record.id,
              subject: { reference: `urn:uuid:${patient.id}` },
              medicationCodeableConcept: { text: record.title },
              status: record.status?.toLowerCase() || 'active',
              effectiveDateTime: record.eventDate,
              note: record.description ? [{ text: record.description }] : [],
            },
          });
          break;

        case RecordType.ALLERGY:
          bundleEntries.push({
            fullUrl: entryId,
            resource: {
              resourceType: 'AllergyIntolerance',
              id: record.id,
              patient: { reference: `urn:uuid:${patient.id}` },
              code: { text: record.title },
              type: 'allergy',
              clinicalStatus: { coding: [{ code: 'active' }] },
              recordedDate: record.eventDate,
              note: record.description ? [{ text: record.description }] : [],
            },
          });
          break;

        case RecordType.LAB_TEST:
        case RecordType.VITAL_SIGN:
          bundleEntries.push({
            fullUrl: entryId,
            resource: {
              resourceType: 'Observation',
              id: record.id,
              subject: { reference: `urn:uuid:${patient.id}` },
              code: { text: record.title },
              status: 'final',
              effectiveDateTime: record.eventDate,
              valueString: record.description || undefined,
            },
          });
          break;

        case RecordType.PROCEDURE:
          bundleEntries.push({
            fullUrl: entryId,
            resource: {
              resourceType: 'Procedure',
              id: record.id,
              subject: { reference: `urn:uuid:${patient.id}` },
              code: { text: record.title },
              status: 'completed',
              performedDateTime: record.eventDate,
              note: record.description ? [{ text: record.description }] : [],
            },
          });
          break;

        default:
          break;
      }
    }

    return {
      resourceType: 'Bundle',
      id: `bundle-${patient.id}`,
      type: 'collection',
      timestamp: new Date().toISOString(),
      entry: bundleEntries,
    };
  }
}
