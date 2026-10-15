# ---------------------------------------------------------------------
# Cluster
# ---------------------------------------------------------------------
variable "cluster_nombre" {
  type    = string
  default = "sa-p9"
}

variable "node_image" {
  type    = string
  default = "kindest/node:v1.31.0"
}

variable "workers" {
  description = "Workers del cluster. 2 = minimo para anti-afinidad y drenaje de un nodo."
  type        = number
  default     = 2
}

# ---------------------------------------------------------------------
# Respaldos (Cloudflare R2). Las llaves llegan por TF_VAR_* desde
# bootstrap.sh (~/.config/sa-p9/); nunca se escriben en el repositorio.
# ---------------------------------------------------------------------
variable "r2_account_id" {
  type = string
}

variable "r2_bucket" {
  type    = string
  default = "sa-p9-velero"
}

variable "r2_access_key" {
  type      = string
  sensitive = true
}

variable "r2_secret_key" {
  type      = string
  sensitive = true
}

variable "velero_prefijo" {
  description = "Carpeta dentro del bucket. Cambiarla equivale a empezar sin respaldos."
  type        = string
  default     = "sa-p9"
}

variable "velero_schedule" {
  description = "Nombre del Schedule (vive en GitOps) del que se toma el ultimo respaldo."
  type        = string
  default     = "sa-p9-horario"
}

variable "restaurar_datos" {
  description = "Si hay respaldos en R2, restaurar PostgreSQL antes de que ArgoCD sincronice."
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------
# GitOps
# ---------------------------------------------------------------------
variable "gitops_repo" {
  type    = string
  default = "https://github.com/DanielVelAv/sa-platform-gitops.git"
}

variable "gitops_revision" {
  type    = string
  default = "main"
}

variable "gitops_path" {
  type    = string
  default = "apps"
}

# ---------------------------------------------------------------------
# Ambientes (heredado de P8)
# ---------------------------------------------------------------------
variable "ambientes" {
  type    = list(string)
  default = ["sa-p9-staging", "sa-p9-produccion"]
}

variable "cuota_requests_cpu" {
  type    = string
  default = "3000m"
}

variable "cuota_requests_memory" {
  type    = string
  default = "4Gi"
}

variable "cuota_limits_cpu" {
  type    = string
  default = "7"
}

variable "cuota_limits_memory" {
  type    = string
  default = "7Gi"
}

variable "cuota_pods" {
  type    = string
  default = "25"
}

variable "limite_default_request_cpu" {
  type    = string
  default = "50m"
}

variable "limite_default_request_memory" {
  type    = string
  default = "64Mi"
}

variable "limite_default_limit_cpu" {
  type    = string
  default = "500m"
}

variable "limite_default_limit_memory" {
  type    = string
  default = "512Mi"
}
