import {
  Inject,
  Injectable,
  InternalServerErrorException,
  ConflictException,
  NotFoundException,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import * as bcrypt from 'bcryptjs';
import { UpdateUserProfileDto } from './dto/updateProfile.dto';
import {
  PrivacySettingsResponseDto,
  UpdatePrivacySettingsDto,
} from './dto/update-privacy-settings.dto';
import { EmailService } from '../email/email.service';
import { CryptoUtil } from '../common/crypto.util';
import { maskUserId } from '../utils/mask-user-id';
import {
  ActivityType,
  PaginatedUserActivityDto,
} from './dto/user-activity.dto';
import { decryptConfession } from '../utils/confession-encryption';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(forwardRef(() => EmailService))
    private emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  // =========================
  // BASIC USER METHODS
  // =========================

  private get aesKey(): string {
    return this.configService.get<string>('app.confessionAesKey', '');
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const emailHash = CryptoUtil.hash(normalizedEmail);
      return await this.userRepository.findOne({ where: { emailHash } });
    } catch {
      throw new InternalServerErrorException('Error finding user by email');
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({
        where: { username: username.trim() },
      });
    } catch {
      throw new InternalServerErrorException('Error finding user by username');
    }
  }

  async findById(id: number): Promise<User | null> {
    try {
      return await this.userRepository.findOne({ where: { id } });
    } catch {
      throw new InternalServerErrorException('Error finding user by ID');
    }
  }

  // =========================
  // CREATE USER
  // =========================

  async create(
    email: string,
    password: string,
    username: string,
  ): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      const { encrypted, iv, tag } = CryptoUtil.encrypt(normalizedEmail);
      const emailHash = CryptoUtil.hash(normalizedEmail);

      const user = this.userRepository.create({
        emailEncrypted: encrypted,
        emailIv: iv,
        emailTag: tag,
        emailHash,
        password: hashedPassword,
        username,
      });

      const savedUser = await this.userRepository.save(user);

      try {
        await this.emailService.sendWelcomeEmail(
          normalizedEmail,
          savedUser.username,
        );
      } catch (err) {
        // Ignore email sending failures as they shouldn't block user creation
        this.logger.warn(
          `Failed to send welcome email to ${normalizedEmail}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
      return savedUser;
    } catch {
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  // =========================
  // PROFILE
  // =========================

  async updateProfile(
    userId: number,
    updateDto: UpdateUserProfileDto,
  ): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    Object.assign(user, updateDto);
    return this.userRepository.save(user);
  }

  // =========================
  // Password reset helpers
  // =========================

  /**
   * Persist legacy reset fields on the user row.
   * (Some flows still use these columns in addition to the password_resets table.)
   */
  async setResetPasswordToken(
    userId: number,
    token: string,
    expiresAt: Date,
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.resetPasswordToken = token;
    user.resetPasswordExpires = expiresAt;
    try {
      await this.userRepository.save(user);
    } catch {
      throw new InternalServerErrorException(
        'Error setting reset password token',
      );
    }
  }

  /**
   * Update the user's password and clear any reset token fields.
   */
  async updatePassword(userId: number, newPassword: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    try {
      await this.userRepository.save(user);
    } catch {
      throw new InternalServerErrorException('Error updating password');
    }
  }

  // =========================
  // ACCOUNT STATUS
  // =========================

  async deactivateAccount(userId: number): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.is_active = false;
    return this.userRepository.save(user);
  }

  async reactivateAccount(userId: number): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.is_active = true;
    return this.userRepository.save(user);
  }

  // =========================
  // ROLE
  // =========================

  async setUserRole(userId: number, role: UserRole): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.role = role;
    return this.userRepository.save(user);
  }

  // =========================
  // SAVE USER
  // =========================

  async saveUser(user: User): Promise<User> {
    return this.userRepository.save(user);
  }

  // =========================
  // 🔐 PRIVACY SETTINGS (FIXED)
  // =========================

  async getPrivacySettings(
    userId: number,
  ): Promise<PrivacySettingsResponseDto> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const ps = user.privacySettings;
    const dataProcessingConsent =
      ps?.dataProcessingConsent === undefined ? true : ps.dataProcessingConsent;

    return {
      isDiscoverable: user.isDiscoverable(),
      canReceiveReplies: user.canReceiveReplies(),
      showReactions: user.shouldShowReactions(),
      dataProcessingConsent: ps?.dataProcessingConsent !== false,
    };
  }

  async updatePrivacySettings(
    userId: number,
    dto: UpdatePrivacySettingsDto,
  ): Promise<PrivacySettingsResponseDto> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const current = user.privacySettings || {
      isDiscoverable: true,
      canReceiveReplies: true,
      showReactions: true,
      dataProcessingConsent: true,
    };

    user.privacySettings = {
      isDiscoverable: dto.isDiscoverable ?? current.isDiscoverable,
      canReceiveReplies: dto.canReceiveReplies ?? current.canReceiveReplies,
      showReactions: dto.showReactions ?? current.showReactions,

      dataProcessingConsent:
        dto.dataProcessingConsent ?? current.dataProcessingConsent ?? true,
    };

    await this.userRepository.save(user);

    await this.enforcePrivacyPolicies(user);

    return {
      isDiscoverable: user.isDiscoverable(),
      canReceiveReplies: user.canReceiveReplies(),
      showReactions: user.shouldShowReactions(),
      dataProcessingConsent:
        user.privacySettings?.dataProcessingConsent !== false,
    };
  }

  private async enforcePrivacyPolicies(user: User): Promise<void> {
    if (!user.canReceiveReplies()) {
      this.logger.debug(`Replies disabled for user ${user.id}`);
    }

    if (!user.shouldShowReactions()) {
      this.logger.debug(`Reactions hidden for user ${user.id}`);
    }
  }

  async getUserConfessionsList(
    userId: number,
    page: number,
    limit: number,
  ): Promise<{ data: any[]; meta: any }> {
    const user = await this.findById(userId);
    if (!user) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }

    const userEntity = this.userRepository.metadata.target;
    const skip = (page - 1) * limit;

    const confessions = await this.userRepository.manager
      .createQueryBuilder(userEntity as any, 'u')
      .leftJoinAndSelect('u.anonymousUser', 'au')
      .leftJoinAndSelect('au.confessions', 'confessions')
      .where('u.id = :userId', { userId })
      .andWhere('confessions.isDeleted = false')
      .andWhere('confessions.isHidden = false')
      .orderBy('confessions.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const [data, total] = confessions;

    const decryptedData = data
      .flatMap((u: any) => u.anonymousUser?.confessions || [])
      .map((confession: any) => {
        if (confession.message) {
          try {
            const { CryptoUtil } = require('../common/crypto.util');
            confession.message = CryptoUtil.decrypt(
              confession.message,
              confession.messageIv,
              confession.messageTag,
            );
          } catch {
            confession.message = '[Encrypted]';
          }
        }
        return confession;
      });

    return {
      data: decryptedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserActivitiesList(
    userId: number,
    page: number,
    limit: number,
  ): Promise<PaginatedUserActivityDto> {
    const user = await this.findById(userId);
    if (!user) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }

    const offset = (page - 1) * limit;

    try {
      // Use raw SQL for efficient multi-table aggregation via UNION ALL
      const rawData = await this.userRepository.manager.query(
        `
      SELECT * FROM (
        -- Confessions
        SELECT 
          c.id::text as id, 
          '${ActivityType.CONFESSION}' as type, 
          c.message as content, 
          json_build_object('isAnchored', c.is_anchored, 'stellarTxHash', c.stellar_tx_hash) as metadata, 
          c.created_at as "createdAt"
        FROM anonymous_confessions c
        JOIN user_anonymous_users ul ON c.anonymous_user_id = ul.anonymous_user_id
        WHERE ul.user_id = $1 AND c."isDeleted" = false AND c.is_hidden = false

        UNION ALL

        -- Comments
        SELECT 
          com.id::text as id, 
          '${ActivityType.COMMENT}' as type, 
          com.content as content, 
          json_build_object('confessionId', com."confessionId") as metadata, 
          com."createdAt" as "createdAt"
        FROM comments com
        JOIN user_anonymous_users ul ON com.anonymous_user_id = ul.anonymous_user_id
        WHERE ul.user_id = $1 AND com."isDeleted" = false

        UNION ALL

        -- Reactions
        SELECT 
          r.id::text as id, 
          '${ActivityType.REACTION}' as type, 
          NULL as content, 
          json_build_object('emoji', r.emoji, 'confessionId', r.confession_id) as metadata, 
          r.created_at as "createdAt"
        FROM reaction r
        JOIN user_anonymous_users ul ON r.anonymous_user_id = ul.anonymous_user_id
        WHERE ul.user_id = $1

        UNION ALL

        -- Reports
        SELECT 
          rep.id::text as id, 
          '${ActivityType.REPORT}' as type, 
          rep.details as content, 
          json_build_object('reason', rep.reason, 'status', rep.status, 'confessionId', rep."confessionId") as metadata, 
          rep.created_at as "createdAt"
        FROM reports rep
        WHERE rep."reporterId" = $1
      ) activity
        ORDER BY "createdAt" DESC
        LIMIT $2 OFFSET $3
        `,
        [userId, limit, offset],
      );

      const countResult = await this.userRepository.manager.query(
        `
        SELECT COUNT(*) as total FROM (
          SELECT 1 FROM anonymous_confessions c JOIN user_anonymous_users ul ON c.anonymous_user_id = ul.anonymous_user_id WHERE ul.user_id = $1 AND c."isDeleted" = false AND c.is_hidden = false
          UNION ALL
          SELECT 1 FROM comments com JOIN user_anonymous_users ul ON com.anonymous_user_id = ul.anonymous_user_id WHERE ul.user_id = $1 AND com."isDeleted" = false
          UNION ALL
          SELECT 1 FROM reaction r JOIN user_anonymous_users ul ON r.anonymous_user_id = ul.anonymous_user_id WHERE ul.user_id = $1
          UNION ALL
          SELECT 1 FROM reports rep WHERE rep."reporterId" = $1
        ) activity
        `,
        [userId],
      );

      const total = parseInt(countResult[0].total, 10);

      const activities = rawData.map((activity: any) => {
        let content = activity.content;

        // Decrypt confessions if owner
        if (activity.type === ActivityType.CONFESSION && content) {
          try {
            content = decryptConfession(content, this.aesKey);
          } catch (e) {
            content = '[Encrypted Content]';
          }
        }

        return {
          id: activity.id,
          type: activity.type as ActivityType,
          content: content,
          metadata: activity.metadata,
          createdAt: activity.createdAt,
        };
      });

      return {
        data: activities,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to aggregate user activity: ${error.message}`, error.stack);
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }
  }
}
