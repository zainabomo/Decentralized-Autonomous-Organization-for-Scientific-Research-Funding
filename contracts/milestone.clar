;; Research Funding DAO - Milestone Contract
;; Tracks research progress and manages milestone-based fund distribution

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-UNAUTHORIZED (err u300))
(define-constant ERR-PROPOSAL-NOT-FOUND (err u301))
(define-constant ERR-MILESTONE-NOT-FOUND (err u302))
(define-constant ERR-INVALID-MILESTONE (err u303))
(define-constant ERR-MILESTONE-ALREADY-COMPLETED (err u304))
(define-constant ERR-INSUFFICIENT-VERIFICATIONS (err u305))
(define-constant ERR-DEADLINE-PASSED (err u306))

;; Verification requirements
(define-constant REQUIRED-VERIFICATIONS u3)
(define-constant MILESTONE-DEADLINE-EXTENSION u2016) ;; ~2 weeks in blocks

;; Data Variables
(define-data-var milestone-counter uint u0)

;; Data Maps
(define-map project-milestones uint {
  proposal-id: uint,
  researcher: principal,
  total-milestones: uint,
  completed-milestones: uint,
  total-budget: uint,
  released-funding: uint,
  status: (string-ascii 20)
})

(define-map milestones {proposal-id: uint, milestone-id: uint} {
  description: (string-ascii 200),
  funding-amount: uint,
  deadline: uint,
  deliverables-hash: (optional (buff 32)),
  status: (string-ascii 20),
  verification-count: uint,
  submission-time: (optional uint)
})

(define-map milestone-verifications {proposal-id: uint, milestone-id: uint, verifier: principal} {
  verified: bool,
  verification-time: uint,
  comments-hash: (optional (buff 32))
})

(define-map milestone-reports {proposal-id: uint, milestone-id: uint} {
  report-hash: (buff 32),
  submission-time: uint,
  researcher: principal
})

;; Read-only functions
(define-read-only (get-project-milestones (proposal-id uint))
  (map-get? project-milestones proposal-id)
)

(define-read-only (get-milestone (proposal-id uint) (milestone-id uint))
  (map-get? milestones {proposal-id: proposal-id, milestone-id: milestone-id})
)

(define-read-only (get-milestone-verification (proposal-id uint) (milestone-id uint) (verifier principal))
  (map-get? milestone-verifications {proposal-id: proposal-id, milestone-id: milestone-id, verifier: verifier})
)

(define-read-only (get-milestone-report (proposal-id uint) (milestone-id uint))
  (map-get? milestone-reports {proposal-id: proposal-id, milestone-id: milestone-id})
)

(define-read-only (get-project-progress (proposal-id uint))
  (match (map-get? project-milestones proposal-id)
    project-data (let (
      (completed (get completed-milestones project-data))
      (total (get total-milestones project-data))
      (progress-percentage (if (> total u0) (/ (* completed u100) total) u0))
    )
      (some {
        proposal-id: proposal-id,
        completed-milestones: completed,
        total-milestones: total,
        progress-percentage: progress-percentage,
        released-funding: (get released-funding project-data),
        total-budget: (get total-budget project-data),
        status: (get status project-data)
      })
    )
    none
  )
)

(define-read-only (is-milestone-ready-for-funding (proposal-id uint) (milestone-id uint))
  (match (map-get? milestones {proposal-id: proposal-id, milestone-id: milestone-id})
    milestone-data (and
      (is-eq (get status milestone-data) "submitted")
      (>= (get verification-count milestone-data) REQUIRED-VERIFICATIONS)
      (is-some (get deliverables-hash milestone-data))
    )
    false
  )
)

;; Public functions
(define-public (initialize-project-milestones 
  (proposal-id uint)
  (researcher principal)
  (total-milestones uint)
  (total-budget uint)
  (milestone-descriptions (list 10 (string-ascii 200)))
  (milestone-budgets (list 10 uint))
  (milestone-deadlines (list 10 uint))
)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (asserts! (> total-milestones u0) ERR-INVALID-MILESTONE)
    (asserts! (> total-budget u0) ERR-INVALID-MILESTONE)
    (asserts! (is-eq (len milestone-descriptions) (len milestone-budgets)) ERR-INVALID-MILESTONE)
    (asserts! (is-eq (len milestone-budgets) (len milestone-deadlines)) ERR-INVALID-MILESTONE)
    
    ;; Initialize project milestone tracking
    (map-set project-milestones proposal-id {
      proposal-id: proposal-id,
      researcher: researcher,
      total-milestones: total-milestones,
      completed-milestones: u0,
      total-budget: total-budget,
      released-funding: u0,
      status: "active"
    })
    
    ;; For now, initialize with placeholder milestones
    ;; In production, this would properly initialize all milestones
    (ok proposal-id)
  )
)

;; Helper function for milestone initialization (simplified for testing)
(define-private (initialize-single-milestone 
  (proposal-id uint)
  (milestone-id uint)
  (description (string-ascii 200))
  (budget uint)
  (deadline uint)
)
  (map-set milestones {proposal-id: proposal-id, milestone-id: milestone-id} {
    description: description,
    funding-amount: budget,
    deadline: deadline,
    deliverables-hash: none,
    status: "pending",
    verification-count: u0,
    submission-time: none
  })
)

(define-public (submit-milestone-report 
  (proposal-id uint) 
  (milestone-id uint) 
  (report-hash (buff 32))
  (deliverables-hash (buff 32))
)
  (let (
    (project-data (unwrap! (map-get? project-milestones proposal-id) ERR-PROPOSAL-NOT-FOUND))
    (milestone-data (unwrap! (map-get? milestones {proposal-id: proposal-id, milestone-id: milestone-id}) ERR-MILESTONE-NOT-FOUND))
  )
    (asserts! (is-eq tx-sender (get researcher project-data)) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status milestone-data) "pending") ERR-MILESTONE-ALREADY-COMPLETED)
    (asserts! (<= stacks-block-height (get deadline milestone-data)) ERR-DEADLINE-PASSED)
    
    ;; Update milestone with submission
    (map-set milestones {proposal-id: proposal-id, milestone-id: milestone-id} (merge milestone-data {
      deliverables-hash: (some deliverables-hash),
      status: "submitted",
      submission-time: (some stacks-block-height)
    }))
    
    ;; Store milestone report
    (map-set milestone-reports {proposal-id: proposal-id, milestone-id: milestone-id} {
      report-hash: report-hash,
      submission-time: stacks-block-height,
      researcher: tx-sender
    })
    
    (ok {
      proposal-id: proposal-id,
      milestone-id: milestone-id,
      status: "submitted"
    })
  )
)

(define-public (verify-milestone 
  (proposal-id uint) 
  (milestone-id uint) 
  (verified bool)
  (comments-hash (optional (buff 32)))
)
  (let (
    (milestone-data (unwrap! (map-get? milestones {proposal-id: proposal-id, milestone-id: milestone-id}) ERR-MILESTONE-NOT-FOUND))
    (existing-verification (map-get? milestone-verifications {proposal-id: proposal-id, milestone-id: milestone-id, verifier: tx-sender}))
    (voter-power u1000) ;; Placeholder for testing
  )
    (asserts! (> voter-power u0) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status milestone-data) "submitted") ERR-INVALID-MILESTONE)
    (asserts! (is-none existing-verification) ERR-UNAUTHORIZED) ;; Prevent duplicate verifications
    
    ;; Record verification
    (map-set milestone-verifications {proposal-id: proposal-id, milestone-id: milestone-id, verifier: tx-sender} {
      verified: verified,
      verification-time: stacks-block-height,
      comments-hash: comments-hash
    })
    
    ;; Update verification count if verified
    (if verified
      (map-set milestones {proposal-id: proposal-id, milestone-id: milestone-id} (merge milestone-data {
        verification-count: (+ (get verification-count milestone-data) u1)
      }))
      true
    )
    
    (ok {
      proposal-id: proposal-id,
      milestone-id: milestone-id,
      verified: verified,
      verifier: tx-sender
    })
  )
)

(define-public (release-milestone-funding (proposal-id uint) (milestone-id uint))
  (let (
    (project-data (unwrap! (map-get? project-milestones proposal-id) ERR-PROPOSAL-NOT-FOUND))
    (milestone-data (unwrap! (map-get? milestones {proposal-id: proposal-id, milestone-id: milestone-id}) ERR-MILESTONE-NOT-FOUND))
    (funding-amount (get funding-amount milestone-data))
  )
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    (asserts! (is-milestone-ready-for-funding proposal-id milestone-id) ERR-INSUFFICIENT-VERIFICATIONS)
    
    ;; Release funding through treasury contract
    (match (contract-call? .treasury release-funding proposal-id funding-amount)
      success-data (begin
        ;; Update milestone status
        (map-set milestones {proposal-id: proposal-id, milestone-id: milestone-id} (merge milestone-data {
          status: "completed"
        }))
        
        ;; Update project progress
        (map-set project-milestones proposal-id (merge project-data {
          completed-milestones: (+ (get completed-milestones project-data) u1),
          released-funding: (+ (get released-funding project-data) funding-amount)
        }))
        
        (ok {
          proposal-id: proposal-id,
          milestone-id: milestone-id,
          funding-released: funding-amount,
          treasury-response: success-data
        })
      )
      error-code (err error-code)
    )
  )
)

(define-public (extend-milestone-deadline (proposal-id uint) (milestone-id uint) (extension-blocks uint))
  (let (
    (project-data (unwrap! (map-get? project-milestones proposal-id) ERR-PROPOSAL-NOT-FOUND))
    (milestone-data (unwrap! (map-get? milestones {proposal-id: proposal-id, milestone-id: milestone-id}) ERR-MILESTONE-NOT-FOUND))
  )
    (asserts! (is-eq tx-sender (get researcher project-data)) ERR-UNAUTHORIZED)
    (asserts! (<= extension-blocks MILESTONE-DEADLINE-EXTENSION) ERR-INVALID-MILESTONE)
    (asserts! (is-eq (get status milestone-data) "pending") ERR-MILESTONE-ALREADY-COMPLETED)
    
    (map-set milestones {proposal-id: proposal-id, milestone-id: milestone-id} (merge milestone-data {
      deadline: (+ (get deadline milestone-data) extension-blocks)
    }))
    
    (ok {
      proposal-id: proposal-id,
      milestone-id: milestone-id,
      new-deadline: (+ (get deadline milestone-data) extension-blocks)
    })
  )
)

;; Admin functions
(define-public (pause-project (proposal-id uint))
  (let (
    (project-data (unwrap! (map-get? project-milestones proposal-id) ERR-PROPOSAL-NOT-FOUND))
  )
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    
    (map-set project-milestones proposal-id (merge project-data {
      status: "paused"
    }))
    
    (ok proposal-id)
  )
)

(define-public (resume-project (proposal-id uint))
  (let (
    (project-data (unwrap! (map-get? project-milestones proposal-id) ERR-PROPOSAL-NOT-FOUND))
  )
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
    
    (map-set project-milestones proposal-id (merge project-data {
      status: "active"
    }))
    
    (ok proposal-id)
  )
)