/**
 * Vitaltron API Client - Type-Safe SDK for Frontend Application
 * Covers all endpoints: Auth, Profiles, Timeline, Document Ingestion, Instant Briefs, QR Sharing, & FHIR.
 */

export interface UserProfile {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  role: 'PATIENT' | 'CLINICIAN' | 'ADMIN';
  isProfileComplete: boolean;
  emailVerifiedAt: string | null;
  patientProfile?: {
    dateOfBirth?: string;
    gender?: string;
    bloodType?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    allergiesSummary?: string;
    chronicConditionsSummary?: string;
    primaryLanguage?: string;
  };
  clinicianProfile?: {
    licenseNumber?: string;
    specialization?: string;
    facilityName?: string;
    isVerified?: boolean;
  };
}

export type RecordType =
  | 'DIAGNOSIS'
  | 'MEDICATION'
  | 'LAB_TEST'
  | 'ALLERGY'
  | 'PROCEDURE'
  | 'VITAL_SIGN'
  | 'CLINICAL_NOTE';

export type VerificationStatus = 'UNVERIFIED' | 'PATIENT_CONFIRMED' | 'CLINICIAN_VERIFIED';

export interface HealthRecord {
  id: string;
  patientId: string;
  createdById: string;
  type: RecordType;
  title: string;
  description?: string;
  eventDate: string;
  severity?: string;
  status?: string;
  facilityName?: string;
  verificationStatus: VerificationStatus;
  fhirData?: any;
  documentId?: string;
}

export interface MedicalDocument {
  id: string;
  userId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  ingestionStatus: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'REVIEW_REQUIRED';
  extractedText?: string;
  extractedEntities?: Array<{
    id: string;
    recordType: RecordType;
    title: string;
    description?: string;
    confidenceScore: number;
    isConfirmed: boolean;
  }>;
}

export interface ClinicalBrief {
  id: string;
  patientId: string;
  generatedById: string;
  summaryText: string;
  activeMedications: Array<{ title: string; description?: string }>;
  severeAllergies: Array<{ title: string; description?: string }>;
  recentLabs: Array<{ title: string; description?: string }>;
  riskFlags: string[];
  briefPurpose: string;
  generatedAt: string;
}

export interface AccessGrantResponse {
  grantId: string;
  shareableToken: string;
  shareableUrl: string;
  qrCodePayload: string;
  expiresAt: string;
  maxAccessCount: number;
  requiresPasscode: boolean;
  recipientName?: string;
}

export class VitaltronApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl = 'http://localhost:3000/api/v1') {
    this.baseUrl = baseUrl;
  }

  public setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'API request failed');
    }

    return data as T;
  }

  // === AUTHENTICATION ===
  async register(data: { email: string; password: string; displayName: string; role?: 'PATIENT' | 'CLINICIAN' }) {
    return this.request<{ accessToken: string; user: UserProfile }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(data: { email: string; password: string }) {
    const res = await this.request<{ accessToken: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(res.accessToken);
    return res;
  }

  async googleSignIn(idToken: string) {
    const res = await this.request<{ accessToken: string; user: UserProfile }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    this.setToken(res.accessToken);
    return res;
  }

  // === USERS & PROFILES ===
  async getProfile() {
    return this.request<UserProfile>('/users/me');
  }

  async updatePatientProfile(data: {
    dateOfBirth?: string;
    gender?: string;
    bloodType?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    allergiesSummary?: string;
    chronicConditionsSummary?: string;
    primaryLanguage?: string;
  }) {
    return this.request('/users/me/patient-profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updateClinicianProfile(data: { licenseNumber: string; specialization: string; facilityName: string }) {
    return this.request('/users/me/clinician-profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async addDependent(data: { displayName: string; relationshipType: 'CHILD' | 'PARENT' | 'SPOUSE' | 'DEPENDENT' | 'OTHER'; email?: string; dateOfBirth?: string }) {
    return this.request('/users/me/dependents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getDependents() {
    return this.request('/users/me/dependents');
  }

  // === HEALTH RECORDS (UNIVERSAL TIMELINE) ===
  async createRecord(data: {
    patientId?: string;
    type: RecordType;
    title: string;
    description?: string;
    eventDate?: string;
    severity?: string;
    status?: string;
    facilityName?: string;
  }) {
    return this.request<HealthRecord>('/health-records', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getTimeline(query?: { patientId?: string; type?: RecordType; search?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) {
    const params = new URLSearchParams(query as any).toString();
    return this.request<{ records: HealthRecord[]; total: number; page: number; totalPages: number }>(`/health-records/timeline?${params}`);
  }

  async getRecordById(id: string) {
    return this.request<HealthRecord>(`/health-records/${id}`);
  }

  async verifyRecord(id: string, status: VerificationStatus) {
    return this.request<HealthRecord>(`/health-records/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  // === SMART DOCUMENT INGESTION ===
  async uploadDocument(data: { fileName: string; fileUrl?: string; fileType?: string; fileSize?: number; rawText?: string }) {
    return this.request<MedicalDocument>('/documents/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getDocuments() {
    return this.request<MedicalDocument[]>('/documents');
  }

  async confirmExtractedEntity(entityId: string, data?: { recordType?: RecordType; title?: string; description?: string }) {
    return this.request(`/documents/entities/${entityId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  // === INSTANT CLINICAL BRIEF ===
  async generateClinicalBrief(patientId?: string, briefPurpose = 'CLINICAL_CONSULTATION') {
    return this.request<ClinicalBrief>('/clinical-briefs/generate', {
      method: 'POST',
      body: JSON.stringify({ patientId, briefPurpose }),
    });
  }

  // === CONTROLLED QR SHARING ===
  async createAccessGrant(data: { patientId?: string; passcode?: string; expiresInHours?: number; maxAccessCount?: number; recipientName?: string }) {
    return this.request<AccessGrantResponse>('/sharing/grants', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getUserGrants() {
    return this.request('/sharing/grants');
  }

  async revokeGrant(grantId: string) {
    return this.request(`/sharing/grants/${grantId}/revoke`, {
      method: 'POST',
    });
  }

  // Public access portal via QR link / token
  async accessShareGrant(token: string, passcode?: string) {
    return this.request<{ patientName: string; clinicalBrief: ClinicalBrief; timelineRecords: HealthRecord[] }>(`/sharing/access/${token}`, {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    });
  }

  // === INTEROPERABILITY (HL7 FHIR) ===
  async exportFhirBundle(patientId?: string) {
    const query = patientId ? `?patientId=${patientId}` : '';
    return this.request(`/interoperability/fhir/patient${query}`);
  }

  async importFhirBundle(bundle: any, patientId?: string) {
    return this.request('/interoperability/fhir/import', {
      method: 'POST',
      body: JSON.stringify({ bundle, patientId }),
    });
  }
}
