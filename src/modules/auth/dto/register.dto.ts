import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: '30123456' })
  @IsString()
  @MinLength(6)
  dni: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @MinLength(2)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(2)
  lastName: string;

  @ApiProperty({ example: 'StrongP@ssw0rd' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  dni: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ example: 'OPERATOR' })
  role: string;

  @ApiProperty()
  createdAt: Date;
}
