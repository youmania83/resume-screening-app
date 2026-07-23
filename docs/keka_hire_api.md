# Keka Hire API Reference & Integration Guide

This document contains the complete API integration reference for the **Keka Hire API (ATS)**. Use this guide to implement endpoints for fetching active jobs, job candidates, and downloading candidate resumes.

---

## 1. Authentication (OAuth 2.0 Client Credentials)

Keka uses OAuth 2.0 with a custom grant type (`kekaapi`) to issue JSON Web Tokens (JWT) for authentication.

### Token Endpoint
*   **Production:** `https://login.keka.com/connect/token`
*   **Sandbox (Testing):** `https://login.kekademo.com/connect/token`

### Request Configuration
*   **HTTP Method:** `POST`
*   **Headers:**
    *   `accept: application/json`
    *   `content-type: application/x-www-form-urlencoded`
*   **Request Body (Form URL-Encoded):**
    *   `grant_type`: `kekaapi`
    *   `scope`: `kekaapi`
    *   `client_id`: `<YOUR_CLIENT_ID>`
    *   `client_secret`: `<YOUR_CLIENT_SECRET>`
    *   `api_key`: `<YOUR_API_KEY>`

### Success Response (200 OK)
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 86400,
  "token_type": "Bearer",
  "scope": "kekaapi"
}
```

### Authorization Header
Include the access token in the headers of all subsequent API calls:
```http
Authorization: Bearer <access_token>
```

---

## 2. API Endpoints

### 2.1 Jobs API

#### 2.1.1 Get All Jobs
Fetch a list of jobs from Keka.
*   **HTTP Method:** `GET`
*   **Path:** `/v1/hire/jobs`
*   **Query Parameters:**
    *   `lastModified` (string, ISO 8601 Date-time, optional): Filter jobs modified after this timestamp.
    *   `JobStatus` (integer, optional): Filter by job status.
    *   `jobBoardIdentifier` (string, optional): Filter by job board identifier.
    *   `pageNumber` (integer, optional): Page number for pagination.
    *   `pageSize` (integer, optional): Page size (default 100, max 200).
*   **Response (200 OK):**
    ```json
    [
      {
        "id": "string",
        "title": "string",
        "description": "string",
        "noOfOpenings": "string",
        "departmentName": "string",
        "jobType": "string",
        "isReferralEnabled": true,
        "isCreatedFromRequisition": true,
        "requisitionIdentifier": "string",
        "canAllowInternalEmployees": true,
        "orgJobId": "string",
        "jobLocations": [
          {
            "name": "string",
            "city": "string",
            "state": "string",
            "countryName": "string"
          }
        ],
        "hiringTeam": [
          {
            "identifier": "string",
            "displayName": "string",
            "type": 0
          }
        ],
        "careerPortalUrl": "string",
        "targetHireDate": "string",
        "status": 0,
        "canListOnCareersSite": true,
        "createdOn": "string",
        "publishedOn": "string",
        "experience": "string",
        "customFields": [
          {
            "fieldName": "string",
            "required": true,
            "fieldType": 0,
            "value": "string"
          }
        ]
      }
    ]
    ```

#### 2.1.2 Get Application Fields
Fetch the form fields associated with a specific job application.
*   **HTTP Method:** `GET`
*   **Path:** `/v1/hire/jobs/{jobId}/applicationfields`
*   **Path Parameters:**
    *   `jobId` (string, required): The ID of the job.
*   **Response (200 OK):**
    ```json
    [
      {
        "fieldName": "string",
        "id": "string",
        "required": true,
        "fieldType": 0,
        "fieldOptions": [
          {
            "id": "string",
            "value": "string"
          }
        ]
      }
    ]
    ```

---

### 2.2 Candidates API

#### 2.2.1 Get Job Candidates
Retrieve candidates associated with a specific job.
*   **HTTP Method:** `GET`
*   **Path:** `/v1/hire/jobs/{jobId}/candidates`
*   **Path Parameters:**
    *   `jobId` (string, required): The ID of the job.
*   **Query Parameters:**
    *   `isArchived` (boolean, optional, default: false): Include archived candidates.
    *   `lastModified` (string, ISO 8601 Date-time, optional)
    *   `pageNumber` (integer, optional)
    *   `pageSize` (integer, optional, default: 100, max: 200)
*   **Response (200 OK):**
    ```json
    [
      {
        "id": "string",
        "firstName": "string",
        "lastName": "string",
        "middleName": "string",
        "gender": 0,
        "email": "string",
        "phone": "string",
        "educationDetails": [
          {
            "degree": "string",
            "branch": "string",
            "dateOfJoining": "string",
            "dateOfCompletion": "string",
            "university": "string",
            "location": "string"
          }
        ],
        "candidateTags": [
          {
            "identifier": "string",
            "name": "string",
            "description": "string"
          }
        ],
        "experienceDetails": [
          {
            "companyName": "string",
            "designation": "string",
            "isCurrentlyWorking": true,
            "dateOfJoining": "string",
            "dateOfRelieving": "string",
            "location": "string"
          }
        ],
        "skills": [
          "string"
        ],
        "additionalCandidateDetails": {
          "additionalProp": "string"
        },
        "jobApplicationDetails": {
          "jobHiringStageId": "string",
          "movedtoStageOn": "string",
          "screeningQuestionsResponse": {
            "additionalProp": "string"
          },
          "appliedOn": "string",
          "status": 0,
          "sourcedBy": "string",
          "sourceTitle": "string",
          "assignedTo": "string",
          "assignedOn": "string"
        },
        "archivedDetails": {
          "additionalProp": "string"
        }
      }
    ]
    ```

#### 2.2.2 Post a Job Candidate
Add a new candidate to a job.
*   **HTTP Method:** `POST`
*   **Path:** `/v1/hire/jobs/{jobId}/candidate`
*   **Path Parameters:**
    *   `jobId` (string, required): The ID of the job.
*   **Headers:**
    *   `content-type: application/json` or `application/json-patch+json`
*   **Body Parameters (JSON Map):**
    Maps the application field identifiers to their corresponding values.
    *   *Standard Fields:*
        *   `"firstName"`: `"John"`
        *   `"lastName"`: `"Doe"`
        *   `"email"`: `"johndoe@example.com"`
        *   `"phone"`: `["91", "9876543210"]` (Format: `[countryCode, mobileNumber]`)
        *   `"gender"`: `"Male"`
        *   `"workExperience"`: `[3, 6]` (Format: `[years, months]`)
        *   `"currentSalary"`: `["INR", 1200000]` (Format: `[currencyCode, amount]`)
        *   `"expectedSalary"`: `["INR", 1500000]`
    *   *Custom Fields:*
        *   `"customFieldIdentifier"`: `"value"`
*   **Response (200 OK):**
    ```json
    "candidate_id_string"
    ```

#### 2.2.3 Update Candidate Details
Update a candidate's information using JSON Patch.
*   **HTTP Method:** `PUT`
*   **Path:** `/v1/hire/jobs/{jobId}/candidate/{candidateId}`
*   **Path Parameters:**
    *   `jobId` (string, required)
    *   `candidateId` (string, required)
*   **Headers:**
    *   `content-type: application/json-patch+json`
*   **Response (200 OK):**
    ```json
    "success_message_string"
    ```

---

### 2.3 Resumes API

#### 2.3.1 Get Candidate Resume
Fetch the download URL or file metadata of a candidate's resume.
*   **HTTP Method:** `GET`
*   **Path:** `/v1/hire/jobs/candidate/{candidateId}/resume`
*   **Path Parameters:**
    *   `candidateId` (string, required): The ID of the candidate.
*   **Response (200 OK):**
    ```json
    {
      "fileUrl": "https://keka-resume-storage.s3.amazonaws.com/path/to/resume.pdf?signatures..."
    }
    ```
    > [!IMPORTANT]
    > To fetch the actual file content, make a `GET` request to the returned `fileUrl`.

#### 2.3.2 Upload Candidate Resume
Upload a resume file for a candidate.
*   **HTTP Method:** `POST`
*   **Path:** `/v1/hire/jobs/candidate/{candidateId}/resume`
*   **Headers:**
    *   `content-type: multipart/form-data`
*   **Path Parameters:**
    *   `candidateId` (string, required)
*   **Body Parameters (Multipart Form):**
    *   `fileName` (file binary, required)
*   **Response (200 OK):**
    ```json
    "success_message_string"
    ```

---

### 2.4 Notes, Interviews, & Scorecards

#### 2.4.1 Adds Candidate Note
Add comments or notes to a candidate's profile.
*   **HTTP Method:** `POST`
*   **Path:** `/v1/hire/jobs/{jobId}/candidate/{candidateId}/notes`
*   **Body Parameters (JSON):**
    ```json
    {
      "comments": "Great programming skills, cleared initial screening.",
      "tags": ["Highly Recommended", "Technical Pass"]
    }
    ```
*   **Response (200 OK):**
    ```json
    "success_message_string"
    ```

#### 2.4.2 Get Candidate Interviews
Fetch scheduled and completed interviews for a candidate.
*   **HTTP Method:** `GET`
*   **Path:** `/v1/hire/jobs/{jobId}/candidate/{candidateId}/interviews`
*   **Response (200 OK):**
    ```json
    [
      {
        "id": "string",
        "candidateId": "string",
        "jobId": "string",
        "interviewDate": "2026-07-25T00:00:00Z",
        "startTime": { "hours": 10, "minutes": 30 },
        "endTime": { "hours": 11, "minutes": 30 },
        "timeZoneId": "India Standard Time",
        "scheduledBy": "string",
        "scheduledDate": "string",
        "interviewType": "Technical",
        "stageId": "string",
        "panelMembers": "string"
      }
    ]
    ```

#### 2.4.3 Get Scorecards
Fetch interview feedback and scorecards for a candidate.
*   **HTTP Method:** `GET`
*   **Path:** `/v1/hire/jobs/{jobId}/candidate/{candidateId}/scorecards`
*   **Response (200 OK):**
    ```json
    [
      {
        "id": "string",
        "jobId": "string",
        "candidateId": "string",
        "stageId": "string",
        "interviewId": "string",
        "overallFeedbackDecision": "Hire",
        "overallComments": "Excellent fit.",
        "feedbackSubmittedByName": "Interviewer Name",
        "sections": [
          {
            "sectionName": "Technical Skills",
            "skillTitle": "Node.js",
            "skillScore": "4/5",
            "sectionComments": "Solid understanding of async patterns."
          }
        ]
      }
    ]
    ```

---

### 2.5 Preboarding API

#### 2.5.1 Get Preboarding Candidates
*   **HTTP Method:** `GET`
*   **Path:** `/v1/hire/preboarding/candidates`
*   **Response (200 OK):**
    ```json
    {
      "items": [
        {
          "id": "string",
          "firstName": "string",
          "lastName": "string",
          "email": "string",
          "mobileNumber": "string",
          "jobtitle": "string",
          "expectedDateOfJoining": "2026-08-01T00:00:00Z",
          "stage": 0,
          "status": 0
        }
      ],
      "totalItems": 1
    }
    ```

#### 2.5.2 Post a Preboarding Candidate
*   **HTTP Method:** `POST`
*   **Path:** `/v1/hire/preboarding/candidates`
