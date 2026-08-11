// BASELINE — the schema as it stood when migrations were adopted.
//
// GENERATED, then frozen. These statements were captured with SHOW CREATE TABLE
// from a database built by the db.sync({alter:true}) this replaces — so they are
// EXACTLY what every existing environment already has, character for character,
// rather than a hand transcription of 12 models that could differ in a column
// type nobody would notice for months.
//
// Frozen on purpose: this file is now static and never regenerated. A baseline
// must describe the schema at ITS point in history. Regenerating it later would
// silently rewrite history to match whatever the models say then, which is the
// one thing a migration must never do.
//
// Each table is created ONLY if absent, and the migration is recorded either
// way. Two very different databases both end up correct:
//   FRESH     no tables            -> all 12 created, parents before children
//   EXISTING  built by alter-sync  -> nothing created, just recorded
//
// Order below is dependency order: a table carrying a foreign key is created
// after the table it points at. MySQL rejects it otherwise.
const STATEMENTS = [
  {
    table: "counters",
    ddl: "CREATE TABLE `counters` (\n  `key` varchar(255) NOT NULL,\n  `value` int NOT NULL DEFAULT '0',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`key`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  },
  {
    table: "designations",
    ddl: "CREATE TABLE `designations` (\n  `id` varchar(255) NOT NULL,\n  `title` varchar(255) NOT NULL,\n  `level` int NOT NULL DEFAULT '100',\n  `description` text,\n  `isActive` tinyint(1) DEFAULT '1',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `title` (`title`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  },
  {
    table: "departments",
    ddl: "CREATE TABLE `departments` (\n  `id` varchar(255) NOT NULL,\n  `name` varchar(255) NOT NULL,\n  `code` varchar(255) DEFAULT NULL,\n  `description` text,\n  `parentDepartmentId` varchar(255) DEFAULT NULL,\n  `headEmployeeId` varchar(255) DEFAULT NULL,\n  `isActive` tinyint(1) DEFAULT '1',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `name` (`name`),\n  UNIQUE KEY `code` (`code`),\n  KEY `parentDepartmentId` (`parentDepartmentId`),\n  CONSTRAINT `departments_ibfk_1` FOREIGN KEY (`parentDepartmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  },
  {
    table: "teams",
    ddl: "CREATE TABLE `teams` (\n  `id` varchar(255) NOT NULL,\n  `name` varchar(255) NOT NULL,\n  `departmentId` varchar(255) DEFAULT NULL,\n  `leadEmployeeId` varchar(255) DEFAULT NULL,\n  `description` text,\n  `isActive` tinyint(1) DEFAULT '1',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `departmentId` (`departmentId`),\n  CONSTRAINT `teams_ibfk_1` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  },
  {
    table: "employees",
    ddl: "CREATE TABLE `employees` (\n  `id` varchar(255) NOT NULL,\n  `employeeCode` varchar(255) DEFAULT NULL,\n  `firebaseUid` varchar(255) DEFAULT NULL,\n  `firstName` varchar(255) NOT NULL,\n  `lastName` varchar(255) DEFAULT NULL,\n  `email` varchar(255) NOT NULL,\n  `phone` varchar(255) DEFAULT NULL,\n  `departmentId` varchar(255) DEFAULT NULL,\n  `designationId` varchar(255) DEFAULT NULL,\n  `teamId` varchar(255) DEFAULT NULL,\n  `managerId` varchar(255) DEFAULT NULL,\n  `status` enum('onboarding','active','suspended','terminated') NOT NULL DEFAULT 'onboarding',\n  `onboardingStage` enum('profile','documents','review','approved') NOT NULL DEFAULT 'profile',\n  `dateOfJoining` date DEFAULT NULL,\n  `candidateId` varchar(255) DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `email` (`email`),\n  UNIQUE KEY `employeeCode` (`employeeCode`),\n  UNIQUE KEY `firebaseUid` (`firebaseUid`),\n  KEY `designationId` (`designationId`),\n  KEY `teamId` (`teamId`),\n  KEY `employees_status` (`status`),\n  KEY `employees_department_id` (`departmentId`),\n  KEY `employees_manager_id` (`managerId`),\n  CONSTRAINT `employees_ibfk_1` FOREIGN KEY (`departmentId`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,\n  CONSTRAINT `employees_ibfk_2` FOREIGN KEY (`designationId`) REFERENCES `designations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,\n  CONSTRAINT `employees_ibfk_3` FOREIGN KEY (`teamId`) REFERENCES `teams` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,\n  CONSTRAINT `employees_ibfk_4` FOREIGN KEY (`managerId`) REFERENCES `employees` (`id`) ON DELETE SET NULL ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  },
  {
    table: "employeeDocuments",
    ddl: "CREATE TABLE `employeeDocuments` (\n  `id` varchar(255) NOT NULL,\n  `employeeId` varchar(255) NOT NULL,\n  `type` enum('id_proof','address_proof','offer_letter','contract','education','other') NOT NULL DEFAULT 'other',\n  `fileKey` varchar(255) DEFAULT NULL,\n  `fileName` varchar(255) DEFAULT NULL,\n  `status` enum('pending','verified','rejected') DEFAULT 'pending',\n  `note` varchar(255) DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `employee_documents_employee_id` (`employeeId`),\n  CONSTRAINT `employeedocuments_ibfk_1` FOREIGN KEY (`employeeId`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  },
  {
    table: "jobPostings",
    ddl: "CREATE TABLE `jobPostings` (\n  `id` varchar(255) NOT NULL,\n  `slug` varchar(255) NOT NULL,\n  `title` varchar(255) NOT NULL,\n  `department` varchar(255) DEFAULT NULL,\n  `departmentId` varchar(255) DEFAULT NULL,\n  `location` varchar(255) DEFAULT NULL,\n  `employmentType` enum('full_time','part_time','contract','internship') NOT NULL DEFAULT 'full_time',\n  `experience` varchar(255) DEFAULT NULL,\n  `summary` varchar(500) DEFAULT NULL,\n  `description` text,\n  `responsibilities` text,\n  `requirements` text,\n  `status` enum('draft','pending_approval','published','closed') NOT NULL DEFAULT 'draft',\n  `approvalNote` text,\n  `closesAt` datetime DEFAULT NULL,\n  `openings` int NOT NULL DEFAULT '1',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `slug` (`slug`),\n  UNIQUE KEY `job_postings_slug` (`slug`),\n  KEY `job_postings_status` (`status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  },
  {
    table: "candidates",
    ddl: "CREATE TABLE `candidates` (\n  `id` varchar(255) NOT NULL,\n  `firstName` varchar(255) NOT NULL,\n  `lastName` varchar(255) DEFAULT NULL,\n  `email` varchar(255) NOT NULL,\n  `phone` varchar(255) DEFAULT NULL,\n  `positionTitle` varchar(255) DEFAULT NULL,\n  `departmentId` varchar(255) DEFAULT NULL,\n  `designationId` varchar(255) DEFAULT NULL,\n  `source` varchar(255) DEFAULT NULL,\n  `resumeKey` varchar(255) DEFAULT NULL,\n  `stage` enum('applied','screening','shortlisted','interview','selected','offer','hired','rejected','withdrawn') NOT NULL DEFAULT 'applied',\n  `notes` text,\n  `jobPostingId` varchar(255) DEFAULT NULL,\n  `convertedEmployeeId` varchar(255) DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `convertedEmployeeId` (`convertedEmployeeId`),\n  KEY `candidates_stage` (`stage`),\n  KEY `candidates_email` (`email`),\n  KEY `candidates_job_posting_id` (`jobPostingId`),\n  CONSTRAINT `candidates_ibfk_1` FOREIGN KEY (`jobPostingId`) REFERENCES `jobPostings` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,\n  CONSTRAINT `candidates_ibfk_2` FOREIGN KEY (`convertedEmployeeId`) REFERENCES `employees` (`id`) ON DELETE SET NULL ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  },
  {
    table: "candidateStageEvents",
    ddl: "CREATE TABLE `candidateStageEvents` (\n  `id` varchar(255) NOT NULL,\n  `candidateId` varchar(255) NOT NULL,\n  `fromStage` varchar(255) DEFAULT NULL,\n  `toStage` varchar(255) NOT NULL,\n  `byUserId` varchar(255) DEFAULT NULL,\n  `note` text,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `candidate_stage_events_candidate_id` (`candidateId`),\n  CONSTRAINT `candidatestageevents_ibfk_1` FOREIGN KEY (`candidateId`) REFERENCES `candidates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  },
  {
    table: "interviewRounds",
    ddl: "CREATE TABLE `interviewRounds` (\n  `id` varchar(255) NOT NULL,\n  `candidateId` varchar(255) NOT NULL,\n  `roundNumber` int NOT NULL DEFAULT '1',\n  `title` varchar(255) DEFAULT NULL,\n  `mode` enum('onsite','online','phone') NOT NULL DEFAULT 'online',\n  `scheduledAt` datetime DEFAULT NULL,\n  `interviewerName` varchar(255) DEFAULT NULL,\n  `interviewerUserId` varchar(255) DEFAULT NULL,\n  `status` enum('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',\n  `result` enum('pending','pass','fail','hold') NOT NULL DEFAULT 'pending',\n  `feedback` text,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `interview_rounds_candidate_id` (`candidateId`),\n  CONSTRAINT `interviewrounds_ibfk_1` FOREIGN KEY (`candidateId`) REFERENCES `candidates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  },
  {
    table: "jobOffers",
    ddl: "CREATE TABLE `jobOffers` (\n  `id` varchar(255) NOT NULL,\n  `candidateId` varchar(255) NOT NULL,\n  `jobPostingId` varchar(255) DEFAULT NULL,\n  `designationId` varchar(255) DEFAULT NULL,\n  `designationTitle` varchar(255) DEFAULT NULL,\n  `ctcAmount` decimal(12,2) DEFAULT NULL,\n  `ctcCurrency` varchar(255) NOT NULL DEFAULT 'INR',\n  `expectedJoiningDate` date DEFAULT NULL,\n  `notes` text,\n  `letterKey` varchar(255) DEFAULT NULL,\n  `status` enum('draft','sent','accepted','rejected','withdrawn','expired') NOT NULL DEFAULT 'draft',\n  `sentAt` datetime DEFAULT NULL,\n  `respondedAt` datetime DEFAULT NULL,\n  `respondedBy` varchar(255) DEFAULT NULL,\n  `responseChannel` enum('hr_recorded','candidate_portal') DEFAULT NULL,\n  `responseNote` text,\n  `responseToken` varchar(255) DEFAULT NULL,\n  `expiresAt` datetime DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `responseToken` (`responseToken`),\n  KEY `jobPostingId` (`jobPostingId`),\n  KEY `job_offers_candidate_id` (`candidateId`),\n  KEY `job_offers_status` (`status`),\n  CONSTRAINT `joboffers_ibfk_1` FOREIGN KEY (`candidateId`) REFERENCES `candidates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,\n  CONSTRAINT `joboffers_ibfk_2` FOREIGN KEY (`jobPostingId`) REFERENCES `jobPostings` (`id`) ON DELETE SET NULL ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  },
  {
    table: "accessRequests",
    ddl: "CREATE TABLE `accessRequests` (\n  `id` varchar(255) NOT NULL,\n  `employeeId` varchar(255) NOT NULL,\n  `target` json NOT NULL,\n  `reason` text,\n  `status` enum('pending','approved','rejected') DEFAULT 'pending',\n  `decidedByUid` varchar(255) DEFAULT NULL,\n  `decidedAt` datetime DEFAULT NULL,\n  `decisionNote` varchar(255) DEFAULT NULL,\n  `iamApplied` tinyint(1) DEFAULT '0',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `access_requests_employee_id` (`employeeId`),\n  KEY `access_requests_status` (`status`),\n  CONSTRAINT `accessrequests_ibfk_1` FOREIGN KEY (`employeeId`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci",
  },
];

module.exports = {
  async up(queryInterface) {
    const existing = await queryInterface.showAllTables();
    const have = new Set(existing.map((t) => (typeof t === 'string' ? t : t.tableName)));

    for (const { table, ddl } of STATEMENTS) {
      if (have.has(table)) continue;
      await queryInterface.sequelize.query(ddl);
    }
  },

  // DELIBERATELY REFUSES. Rolling back a baseline drops every table in the
  // service — every employee, candidate, offer and document. No pipeline should
  // reach that by running `migrate:down` one step too many.
  async down() {
    throw new Error(
      'The baseline cannot be rolled back — it would drop every workspace table. '
      + 'Restore from a backup instead.',
    );
  },
};
